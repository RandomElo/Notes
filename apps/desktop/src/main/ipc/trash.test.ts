import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RemoteFsError, transfererCorbeille } from '@notes/core';
import type { RemoteFs } from '@notes/core';
import { MemoryRemoteFs } from '@notes/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { SettingsStore } from '../settings/settings-store';
import { creerFileDAttente } from '../vault/serial-queue';
import { VaultService } from '../vault/vault-service';
import { creerHandlersCorbeille } from './trash';
import { creerHandlersVault } from './vault';

/** Un vault sur le disque, et un NAS en mémoire qu'on peut couper (`etat.nas`). */
async function monter() {
  const base = await mkdtemp(join(tmpdir(), 'notes-ipc-corbeille-'));
  const vault = new VaultService(new SettingsStore(join(base, 'settings.json')), vi.fn(), join(base, 'propose'));
  const file = creerFileDAttente();
  const handlersVault = creerHandlersVault({ vault, file, choisirDossier: async () => join(base, 'vault') });
  await handlersVault.choisirDossier();
  const nas = new MemoryRemoteFs();
  const etat = { nas: 'joignable' as 'joignable' | 'injoignable' | 'non_regle' };
  const avecNas = async <T>(action: (distant: RemoteFs) => Promise<T>): Promise<T | null> => {
    if (etat.nas === 'non_regle') {
      return null;
    }
    if (etat.nas === 'injoignable') {
      throw new RemoteFsError('injoignable', 'NAS injoignable');
    }
    return action(nas);
  };
  const corbeille = creerHandlersCorbeille({ vault, file, avecNas });
  return { vault, handlersVault, corbeille, nas, etat };
}

describe('handlers corbeille', () => {
  it('met des pages à la corbeille, une sous-page sélectionnée avec son parent comprise', async () => {
    const { vault, handlersVault, corbeille } = await monter();
    const projets = await handlersVault.creerPage({ parent: '', titre: 'Projets' });
    const idees = await handlersVault.creerPage({ parent: '', titre: 'Idées' });
    if (!projets.ok || !idees.ok) {
      throw new Error('création refusée');
    }
    const refonte = await handlersVault.creerPage({ parent: projets.page.chemin, titre: 'Refonte' });
    if (!refonte.ok) {
      throw new Error('création refusée');
    }

    const resultat = await corbeille.mettre({ chemins: [refonte.page.chemin, projets.page.chemin] });
    expect(resultat.ok && resultat.arbre.map((noeud) => noeud.titre)).toEqual(['Idées']);
    const liste = await corbeille.lister();
    expect(liste.entrees.map((entree) => [entree.titre, entree.emplacement])).toEqual([['Projets', 'poste']]);
    expect(liste.nas).toBe('joignable');
    vault.arreter();
  });

  it('refuse une demande invalide sans rien toucher', async () => {
    const { vault, corbeille } = await monter();
    expect(await corbeille.mettre({ chemins: ['../ailleurs'] })).toMatchObject({ ok: false, erreur: { code: 'requete_invalide' } });
    expect(await corbeille.mettre({ chemins: [] })).toMatchObject({ ok: false });
    expect(await corbeille.supprimer({ entree: '../Projets', emplacement: 'poste' })).toMatchObject({ ok: false, erreur: { code: 'requete_invalide' } });
    expect(await corbeille.restaurer({ entree: 'x', emplacement: 'ailleurs' })).toMatchObject({ ok: false, erreur: { code: 'requete_invalide' } });
    vault.arreter();
  });

  it('liste les entrées du NAS, les restaure, et dit quand le NAS ne répond pas', async () => {
    const { vault, handlersVault, corbeille, nas, etat } = await monter();
    const page = await handlersVault.creerPage({ parent: '', titre: 'Courses' });
    if (!page.ok) {
      throw new Error('création refusée');
    }
    await corbeille.mettre({ chemins: [page.page.chemin] });
    await transfererCorbeille(vault.contexte().fs, nas);

    const liste = await corbeille.lister();
    expect(liste.entrees.map((entree) => [entree.titre, entree.emplacement])).toEqual([['Courses', 'nas']]);
    const entree = liste.entrees[0]?.entree ?? '';
    expect(await corbeille.apercu({ entree, emplacement: 'nas' })).toMatchObject({ ok: true, nature: 'page', titre: 'Courses' });

    etat.nas = 'injoignable';
    expect(await corbeille.lister()).toEqual({ entrees: [], nas: 'injoignable' });
    expect(await corbeille.restaurer({ entree, emplacement: 'nas' })).toMatchObject({ ok: false, erreur: { code: 'nas_indisponible' } });

    etat.nas = 'joignable';
    const restauree = await corbeille.restaurer({ entree, emplacement: 'nas' });
    expect(restauree.ok && restauree.arbre.map((noeud) => noeud.titre)).toEqual(['Courses']);
    expect((await corbeille.lister()).entrees).toEqual([]);
    vault.arreter();
  });

  it('vide les deux corbeilles', async () => {
    const { vault, handlersVault, corbeille, nas } = await monter();
    const a = await handlersVault.creerPage({ parent: '', titre: 'A' });
    const b = await handlersVault.creerPage({ parent: '', titre: 'B' });
    if (!a.ok || !b.ok) {
      throw new Error('création refusée');
    }
    await corbeille.mettre({ chemins: [a.page.chemin] });
    await transfererCorbeille(vault.contexte().fs, nas);
    await corbeille.mettre({ chemins: [b.page.chemin] });
    expect((await corbeille.lister()).entrees).toHaveLength(2);
    expect(await corbeille.vider()).toEqual({ ok: true });
    expect((await corbeille.lister()).entrees).toEqual([]);
    vault.arreter();
  });
});
