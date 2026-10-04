import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TreeNode } from '@notes/core';
import { describe, expect, it, vi } from 'vitest';
import { SettingsStore } from '../settings/settings-store';
import { VaultService, raisonDuRefus } from '../vault/vault-service';
import { creerHandlersVault } from './vault';

async function monter() {
  const base = await mkdtemp(join(tmpdir(), 'notes-ipc-vault-'));
  const fichierReglages = join(base, 'settings.json');
  const dossier = join(base, 'vault');
  const signal = vi.fn();
  const vault = new VaultService(new SettingsStore(fichierReglages), signal, join(base, 'propose'));
  const handlers = creerHandlersVault({ vault, choisirDossier: async () => dossier });
  return { handlers, vault, dossier, fichierReglages, base, signal };
}

const titres = (arbre: TreeNode[]): unknown[] =>
  arbre.map((noeud) => (noeud.enfants.length === 0 ? noeud.titre : [noeud.titre, titres(noeud.enfants)]));

describe('handlers vault', () => {
  it("n'a pas de vault au départ, puis le crée dans le dossier choisi et le retient", async () => {
    const { handlers, dossier, fichierReglages, vault } = await monter();
    expect((await handlers.etat()).dossier).toBeNull();
    await expect(handlers.lireArbre()).rejects.toThrow();

    expect(await handlers.choisirDossier()).toMatchObject({ dossier });
    expect(JSON.parse(await readFile(fichierReglages, 'utf8'))).toMatchObject({ vaultLocal: dossier });
    expect(await handlers.lireArbre()).toEqual([]);
    vault.arreter();
  });

  it('crée, déplace, renomme et duplique sur le disque, puis retrouve tout après redémarrage', async () => {
    const { handlers, dossier, fichierReglages, vault } = await monter();
    await handlers.choisirDossier();

    const projets = await handlers.creerPage({ parent: '', titre: 'Projets' });
    const idees = await handlers.creerPage({ parent: '', titre: 'Idées' });
    if (!projets.ok || !idees.ok) {
      throw new Error('création refusée');
    }
    await handlers.creerPage({ parent: 'Projets', titre: 'Refonte du NAS' });
    await handlers.deplacerPage({ chemin: 'Idées', parent: '', index: 0 });
    await handlers.renommerPage({ chemin: 'Projets', titre: 'Chantiers' });
    const vide = await handlers.creerPage({ parent: 'Chantiers', titre: 'Sans titre' });
    expect(vide.ok && (await handlers.supprimerPageVide({ chemin: vide.page.chemin })).ok).toBe(true);
    const derniere = await handlers.dupliquerPage({ chemin: 'Idées' });

    const attendu = ['Idées', 'Idées (copie)', ['Chantiers', ['Refonte du NAS']]];
    expect(derniere.ok && titres(derniere.arbre)).toEqual(attendu);
    expect((await readdir(dossier)).sort()).toEqual(['.order', 'Chantiers', 'Idées', 'Idées (copie)']);
    vault.arreter();

    // Nouvelle instance, mêmes réglages : comme un redémarrage de l'application.
    const relance = new VaultService(new SettingsStore(fichierReglages), () => undefined);
    await relance.demarrer();
    const apres = creerHandlersVault({ vault: relance, choisirDossier: async () => null });
    expect((await apres.etat()).dossier).toBe(dossier);
    expect(titres(await apres.lireArbre())).toEqual(attendu);
    relance.arreter();
  });

  it('rend une erreur lisible plutôt que de planter', async () => {
    const { handlers, vault } = await monter();
    expect(await handlers.creerPage({ parent: '', titre: 'X' })).toMatchObject({ ok: false, erreur: { code: 'introuvable' } });
    await handlers.choisirDossier();
    expect(await handlers.creerPage({ parent: '', titre: '   ' })).toMatchObject({ ok: false, erreur: { code: 'titre_invalide' } });
    expect(await handlers.renommerPage({ chemin: 'Absente', titre: 'X' })).toMatchObject({ ok: false, erreur: { code: 'introuvable' } });
    vault.arreter();
  });

  it('refuse une demande malformée venue du renderer, sans rien écrire', async () => {
    const { handlers, dossier, vault } = await monter();
    await handlers.choisirDossier();
    const mauvaises = [
      handlers.creerPage(null),
      handlers.creerPage({ parent: '../ailleurs', titre: 'X' }),
      handlers.creerPage({ parent: '', titre: 42 }),
      handlers.creerPage({ parent: '', titre: 'X', index: -1 }),
      handlers.creerPage({ parent: '', titre: 'X', index: 1.5 }),
      handlers.renommerPage({ chemin: '', titre: 'X' }),
      handlers.deplacerPage({ chemin: '/etc', parent: '' }),
      handlers.deplacerPage({ chemin: 'a', parent: 'b/../..' }),
      handlers.dupliquerPage({ chemin: ['a'] }),
      handlers.supprimerPageVide({ chemin: '../a' }),
      handlers.importer('texte'),
    ];
    for (const resultat of await Promise.all(mauvaises)) {
      expect(resultat).toMatchObject({ ok: false, erreur: { code: 'requete_invalide' } });
    }
    expect(await readdir(dossier)).toEqual([]);
    vault.arreter();
  });

  it('exécute les opérations simultanées une par une', async () => {
    const { handlers, vault } = await monter();
    await handlers.choisirDossier();
    const resultats = await Promise.all(
      Array.from({ length: 8 }, (_, numero) => handlers.creerPage({ parent: '', titre: `Page ${numero + 1}` })),
    );
    expect(resultats.every((resultat) => resultat.ok)).toBe(true);
    expect(titres(await handlers.lireArbre())).toEqual(Array.from({ length: 8 }, (_, numero) => `Page ${numero + 1}`));
    vault.arreter();
  });

  it('lit puis enregistre le corps d’une page sur le disque, sans toucher au reste du fichier', async () => {
    const { handlers, dossier, vault } = await monter();
    await handlers.choisirDossier();
    const page = await handlers.creerPage({ parent: '', titre: 'Journal' });
    if (!page.ok) {
      throw new Error('création refusée');
    }
    const fichier = join(dossier, 'Journal', 'page.md');
    const avant = await readFile(fichier, 'utf8');
    expect(await handlers.lirePage({ chemin: 'Journal' })).toEqual({ ok: true, corps: '', surcharges: {} });

    // Sans changement, rien n'est écrit : le fichier reste identique à l'octet près.
    expect(await handlers.enregistrerPage({ chemin: 'Journal', corps: '', corpsDeBase: '' })).toEqual({ ok: true, ecrit: false, conflit: null });
    expect(await readFile(fichier, 'utf8')).toBe(avant);

    expect(await handlers.enregistrerPage({ chemin: 'Journal', corps: '# Lundi\n', corpsDeBase: '' })).toEqual({ ok: true, ecrit: true, conflit: null });
    expect(await handlers.lirePage({ chemin: 'Journal' })).toEqual({ ok: true, corps: '# Lundi\n', surcharges: {} });
    const apres = await readFile(fichier, 'utf8');
    expect(apres.endsWith('---\n# Lundi\n')).toBe(true);
    expect(apres).toContain('title: Journal');
    vault.arreter();
  });

  it('garde la version modifiée ailleurs au lieu de l’écraser', async () => {
    const { handlers, dossier, vault } = await monter();
    await handlers.choisirDossier();
    await handlers.creerPage({ parent: '', titre: 'Journal' });
    const fichier = join(dossier, 'Journal', 'page.md');
    const modifieAilleurs = (await readFile(fichier, 'utf8')) + 'écrit par un autre outil\n';
    await writeFile(fichier, modifieAilleurs);

    const resultat = await handlers.enregistrerPage({ chemin: 'Journal', corps: 'écrit ici\n', corpsDeBase: '' });
    expect(resultat).toMatchObject({ ok: true, ecrit: true });
    const conflit = resultat.ok ? resultat.conflit : null;
    expect(conflit).toMatch(/^page\.conflit-/);
    expect(await readFile(join(dossier, 'Journal', conflit ?? ''), 'utf8')).toBe(modifieAilleurs);
    expect(await handlers.lirePage({ chemin: 'Journal' })).toEqual({ ok: true, corps: 'écrit ici\n', surcharges: {} });
    vault.arreter();
  });

  it('refuse de lire ou d’enregistrer hors du vault ou avec une demande malformée', async () => {
    const { handlers, vault } = await monter();
    await handlers.choisirDossier();
    for (const demande of [null, {}, { chemin: '../ailleurs' }, { chemin: '/etc/passwd' }, { chemin: 42 }]) {
      expect(await handlers.lirePage(demande)).toMatchObject({ ok: false, erreur: { code: 'requete_invalide' } });
    }
    for (const demande of [{ chemin: 'Journal' }, { chemin: 'Journal', corps: 'x' }, { chemin: '../x', corps: 'x', corpsDeBase: '' }, { chemin: 'Journal', corps: 1, corpsDeBase: '' }]) {
      expect(await handlers.enregistrerPage(demande)).toMatchObject({ ok: false, erreur: { code: 'requete_invalide' } });
    }
    expect(await handlers.lirePage({ chemin: 'Absente' })).toMatchObject({ ok: false, erreur: { code: 'introuvable' } });
    expect(await handlers.enregistrerPage({ chemin: 'Absente', corps: 'x', corpsDeBase: '' })).toMatchObject({ ok: false, erreur: { code: 'introuvable' } });
    vault.arreter();
  });

  it('attend la fin des écritures demandées', async () => {
    const { handlers, dossier, vault } = await monter();
    await handlers.choisirDossier();
    await handlers.creerPage({ parent: '', titre: 'Journal' });
    // L'enregistrement n'est pas attendu ici : c'est « attendre » qui garantit qu'il est fini.
    void handlers.enregistrerPage({ chemin: 'Journal', corps: 'dernière frappe\n', corpsDeBase: '' });
    await handlers.attendre();
    expect(await readFile(join(dossier, 'Journal', 'page.md'), 'utf8')).toContain('dernière frappe');
    vault.arreter();
  });

  it('garde le vault ouvert si l’utilisateur annule le choix du dossier', async () => {
    const { vault, dossier } = await monter();
    await vault.definirDossier(dossier);
    const handlers = creerHandlersVault({ vault, choisirDossier: async () => null });
    expect(await handlers.choisirDossier()).toMatchObject({ dossier });
    vault.arreter();
  });
});

describe('raisonDuRefus', () => {
  it('refuse la racine, le dossier personnel et les chemins relatifs', () => {
    for (const chemin of ['/', homedir(), `${homedir()}/`, 'relatif', '', 42, null]) {
      expect(raisonDuRefus(chemin)).not.toBeNull();
    }
    expect(raisonDuRefus(join(homedir(), 'Notes'))).toBeNull();
  });

  it('renomme les mentions dans les pages qui citent la page renommée, sauf la page ouverte', async () => {
    const { handlers, vault } = await monter();
    await handlers.choisirDossier();
    const cible = await handlers.creerPage({ parent: '', titre: 'Cible' });
    const citante = await handlers.creerPage({ parent: '', titre: 'Citante' });
    const ouverte = await handlers.creerPage({ parent: '', titre: 'Ouverte' });
    if (!cible.ok || !citante.ok || !ouverte.ok) {
      throw new Error('création refusée');
    }
    const corps = `Intro  _gardée_.\n\nVoir [Cible](notes://${cible.page.id}).\n`;
    for (const page of ['Citante', 'Ouverte']) {
      expect(await handlers.enregistrerPage({ chemin: page, corps, corpsDeBase: '' })).toMatchObject({ ok: true, ecrit: true });
    }

    expect(await handlers.renommerPage({ chemin: 'Cible', titre: 'Nouveau nom', sauf: ouverte.page.id })).toMatchObject({ ok: true });
    expect(await handlers.lirePage({ chemin: 'Citante' })).toMatchObject({ corps: `Intro  _gardée_.\n\nVoir [Nouveau nom](notes://${cible.page.id}).\n` });
    expect(await handlers.lirePage({ chemin: 'Ouverte' })).toMatchObject({ corps });
    expect(await handlers.listerMentionsCassees()).toEqual([]);
    vault.arreter();
  });
});
