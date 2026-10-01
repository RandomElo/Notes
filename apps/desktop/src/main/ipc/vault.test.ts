import { mkdtemp, readFile, readdir } from 'node:fs/promises';
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
});
