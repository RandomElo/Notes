import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RemoteFsError, reglagesIaParDefaut } from '@notes/core';
import type { SyncStatus } from '@notes/core';
import { MemoryIndexStore, MemoryLocalFs, MemoryRemoteFs } from '@notes/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { SettingsStore } from '../settings/settings-store';
import type { CompanionCredentials } from '../smb/protocol';
import { identiteDuPoste } from './device';
import { SyncScheduler } from './scheduler';

const nas = { hote: '192.0.2.10', partage: 'partage', utilisateur: 'utilisateur', dossierVault: 'Notes' };

/** Le NAS en mémoire, avec ce qu'une connexion du compagnon offre en plus. */
class FausseConnexion extends MemoryRemoteFs {
  fermetures = 0;
  /** Tant qu'elle n'est pas résolue, lister ne répond pas : un NAS qui ne répond plus. */
  silence: Promise<void> | null = null;
  fermer(): void {
    this.fermetures++;
  }
  override async lister(chemin: string) {
    await this.silence;
    return super.lister(chemin);
  }
}

async function monter(options: { reglagesNas?: boolean; motDePasse?: string | null } = {}) {
  const dossier = await mkdtemp(join(tmpdir(), 'notes-sync-'));
  const reglages = new SettingsStore(join(dossier, 'settings.json'));
  await reglages.ecrire({ nas: options.reglagesNas === false ? null : nas, vaultLocal: '/srv/notes', appareil: null, ia: reglagesIaParDefaut });
  const local = MemoryLocalFs.depuis({ 'Alpha/page.md': 'alpha\n' });
  const partage = new FausseConnexion();
  const connexions: CompanionCredentials[] = [];
  const etats: SyncStatus[] = [];
  const sync = new SyncScheduler({
    reglages,
    lireMotDePasse: async () => (options.motDePasse === undefined ? 'mot de passe' : options.motDePasse),
    localFs: () => local,
    creerConnexion: (identifiants) => {
      connexions.push(identifiants);
      return partage;
    },
    index: new MemoryIndexStore(),
    appareil: identiteDuPoste(reglages),
    surEtat: (etat) => etats.push(etat),
    delaiApresModificationMs: 20,
  });
  return { dossier, reglages, local, partage, connexions, etats, sync };
}

describe('SyncScheduler', () => {
  it('reste désactivé tant que le NAS n’est pas réglé, sans ouvrir de connexion', async () => {
    const { sync, connexions } = await monter({ reglagesNas: false });
    await sync.synchroniser();
    expect(sync.etat()).toMatchObject({ etat: 'desactivee', message: 'Connexion au NAS pas réglée' });
    expect(connexions).toEqual([]);
  });

  it('reste désactivé sans mot de passe', async () => {
    const { sync, connexions } = await monter({ motDePasse: null });
    await sync.synchroniser();
    expect(sync.etat().message).toBe('Mot de passe du NAS à saisir dans les réglages');
    expect(connexions).toEqual([]);
  });

  it('synchronise dans le dossier du vault sur le partage et garde la connexion', async () => {
    const { sync, partage, connexions, etats } = await monter();
    await sync.synchroniser();
    expect(partage.contenu()).toEqual({ 'Notes/Alpha/page.md': 'alpha\n' });
    expect(etats.map((etat) => etat.etat)).toEqual(['en_cours', 'synchronise']);
    expect(sync.etat().derniereSync).not.toBeNull();

    await sync.synchroniser();
    expect(connexions).toHaveLength(1);
  });

  it('n’ouvre qu’une connexion quand un cycle et une lecture de verrou arrivent ensemble', async () => {
    const { sync, connexions } = await monter();
    await Promise.all([sync.synchroniser(), sync.etatVerrou('Alpha'), sync.prendreVerrou('Alpha', false)]);
    expect(connexions).toHaveLength(1);
  });

  it('montre le NAS injoignable, puis reprend', async () => {
    const { sync, partage } = await monter();
    partage.panne = true;
    await sync.synchroniser();
    expect(sync.etat()).toMatchObject({ etat: 'injoignable', message: 'NAS injoignable' });
    partage.panne = false;
    await sync.synchroniser();
    expect(sync.etat().etat).toBe('synchronise');
  });

  it('garde l’heure du premier échec tant que le NAS reste injoignable', async () => {
    const { sync, partage } = await monter();
    partage.panne = true;
    await sync.synchroniser();
    const depuis = sync.etat().injoignableDepuis;
    expect(depuis).not.toBeNull();
    await new Promise((resoudre) => setTimeout(resoudre, 5));
    await sync.synchroniser();
    expect(sync.etat().injoignableDepuis).toBe(depuis);
    partage.panne = false;
    await sync.synchroniser();
    expect(sync.etat().injoignableDepuis).toBeNull();
  });

  it('montre le NAS injoignable dès la perte du réseau, coupe le cycle en cours et reprend au retour', async () => {
    const { sync, partage, local, etats } = await monter();
    await sync.synchroniser();
    // Le NAS ne répond plus : sans la perte du réseau signalée, le cycle attendrait la fin du délai.
    let debloquer = (): void => undefined;
    partage.silence = new Promise<void>((resoudre) => (debloquer = resoudre));
    const cycle = sync.synchroniser();
    await vi.waitFor(() => expect(sync.etat().etat).toBe('en_cours'));
    sync.signalerReseau(false);
    expect(sync.etat()).toMatchObject({ etat: 'injoignable', message: 'NAS injoignable' });
    expect(partage.fermetures).toBe(1);
    debloquer();
    await cycle;
    expect(sync.etat().etat).toBe('injoignable');
    expect(etats.at(-1)?.etat).toBe('injoignable');

    // Pas de cycle tant que le réseau manque.
    partage.silence = null;
    await local.ecrireTexte('Alpha/page.md', 'hors ligne\n');
    await sync.synchroniser();
    expect(partage.contenu()['Notes/Alpha/page.md']).toBe('alpha\n');

    sync.signalerReseau(true);
    await vi.waitFor(() => expect(partage.contenu()['Notes/Alpha/page.md']).toBe('hors ligne\n'));
    expect(sync.etat().etat).toBe('synchronise');
  });

  it('ne réessaie pas avec des identifiants refusés avant un changement de réglages', async () => {
    const { sync, partage, connexions } = await monter();
    partage.echouerSur = () => {
      throw new RemoteFsError('identifiants_refuses', 'refusé');
    };
    await sync.synchroniser();
    expect(sync.etat().etat).toBe('injoignable');
    await sync.synchroniser();
    await sync.prendreVerrou('Alpha', false);
    expect(connexions).toHaveLength(1);

    partage.echouerSur = null;
    await sync.reconfigurer();
    expect(connexions).toHaveLength(2);
    expect(sync.etat().etat).toBe('synchronise');
  });

  it('pose le verrou d’une page et signale celui d’un autre appareil', async () => {
    const { sync, partage, reglages } = await monter();
    expect(await sync.prendreVerrou('Alpha', false)).toEqual({ ok: true });
    expect(partage.contenu()['Notes/Alpha/.lock']).toContain((await reglages.lire()).appareil!);
    partage.poser('Notes/Beta/.lock', JSON.stringify({ holder: 'autre', nom: 'portable', pid: 1, heartbeat: new Date().toISOString() }));
    expect(await sync.etatVerrou('Beta')).toMatchObject({ etat: 'autre', nom: 'portable' });
    expect(await sync.prendreVerrou('Beta', false)).toEqual({ ok: false, nom: 'portable' });
  });

  it('laisse écrire hors ligne', async () => {
    const { sync, partage } = await monter();
    partage.panne = true;
    expect(await sync.prendreVerrou('Alpha', false)).toEqual({ ok: true });
    expect(await sync.etatVerrou('Alpha')).toEqual({ etat: 'inconnu' });
  });

  it('fait un dernier cycle à la fermeture, rend ses verrous et ferme la connexion', async () => {
    const { sync, partage, local } = await monter();
    await sync.prendreVerrou('Alpha', false);
    await local.ecrireTexte('Alpha/page.md', 'dernière frappe\n');
    await sync.arreter();
    expect(partage.contenu()).toEqual({ 'Notes/Alpha/page.md': 'dernière frappe\n' });
    expect(partage.fermetures).toBe(1);
    await sync.synchroniser();
    expect(partage.contenu()).toEqual({ 'Notes/Alpha/page.md': 'dernière frappe\n' });
  });

  it('envoie une modification du poste peu après, sans attendre l’intervalle', async () => {
    const { sync, partage, local } = await monter();
    await sync.synchroniser();
    await local.ecrireTexte('Alpha/page.md', 'modifiée\n');
    sync.signalerModificationLocale();
    sync.signalerModificationLocale();
    await vi.waitFor(() => expect(partage.contenu()['Notes/Alpha/page.md']).toBe('modifiée\n'));
  });

  it('relance un cycle demandé pendant qu’un autre tourne', async () => {
    const { sync, partage, local } = await monter();
    const premier = sync.synchroniser();
    await local.ecrireTexte('Alpha/page.md', 'pendant le cycle\n');
    await sync.quitterPage('Alpha');
    sync.signalerModificationLocale();
    await premier;
    await vi.waitFor(() => expect(partage.contenu()['Notes/Alpha/page.md']).toBe('pendant le cycle\n'));
  });

  it('rend le verrou d’une page quittée dès qu’elle est sur le NAS', async () => {
    const { sync, partage, local } = await monter();
    await sync.synchroniser();
    await sync.prendreVerrou('Alpha', false);
    await local.ecrireTexte('Alpha/page.md', 'dernière frappe\n');
    expect(partage.contenu()['Notes/Alpha/.lock']).toBeDefined();
    await sync.quitterPage('Alpha');
    expect(partage.contenu()['Notes/Alpha/page.md']).toBe('dernière frappe\n');
    expect(partage.contenu()['Notes/Alpha/.lock']).toBeUndefined();
  });

  it('dit quelles pages le NAS n’a pas encore, sans le contacter', async () => {
    const { sync, local, partage } = await monter();
    expect(await sync.pagesEnAttente(['Alpha', 'Absente'])).toEqual(['Alpha']);
    await sync.synchroniser();
    expect(await sync.pagesEnAttente(['Alpha'])).toEqual([]);
    partage.panne = true;
    await local.ecrireTexte('Alpha/page.md', 'hors ligne\n');
    expect(await sync.pagesEnAttente(['Alpha'])).toEqual(['Alpha']);
  });

  it('ne signale aucune page en attente quand la sync n’est pas réglée', async () => {
    const { sync } = await monter({ reglagesNas: false });
    expect(await sync.pagesEnAttente(['Alpha'])).toEqual([]);
  });

  it('tire un identifiant d’appareil une seule fois et le garde dans les réglages', async () => {
    const { reglages, dossier } = await monter();
    const identite = identiteDuPoste(reglages);
    const premiere = await identite();
    expect(premiere.appareil).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.parse(await readFile(join(dossier, 'settings.json'), 'utf8')).appareil).toBe(premiere.appareil);
    expect((await identiteDuPoste(reglages)()).appareil).toBe(premiere.appareil);
  });
});
