import { RemoteFsError } from '@notes/core';
import type { RemoteEntry } from '@notes/core';
import { describe, expect, it } from 'vitest';
import { testerConnexion } from './connection-test';
import type { TestableConnection } from './connection-test';

/** Fausse connexion en mémoire, avec des pannes réglables. */
function fausseConnexion(options: { echecOuverture?: RemoteFsError; reponsesChiffrees?: number; corrompre?: boolean } = {}) {
  const fichiers = new Map<string, Uint8Array>();
  const dossiers: string[] = [];
  const etat = { fermee: false };
  const connexion: TestableConnection = {
    ouvrir: async () => {
      if (options.echecOuverture !== undefined) {
        throw options.echecOuverture;
      }
    },
    infosSession: async () => ({
      dialecte: 'SMB 3.1.1',
      signature: true,
      chiffrement: true,
      reponsesChiffrees: options.reponsesChiffrees ?? 12,
      reponsesTotal: 12,
    }),
    fermer: () => {
      etat.fermee = true;
    },
    infos: async (): Promise<RemoteEntry | null> => null,
    lister: async () => [],
    lire: async (chemin) => {
      const contenu = fichiers.get(chemin);
      if (contenu === undefined) {
        throw new RemoteFsError('introuvable', 'introuvable');
      }
      return options.corrompre === true ? new Uint8Array([1, 2, 3]) : contenu;
    },
    ecrire: async (chemin, contenu) => {
      fichiers.set(chemin, contenu);
    },
    creerDossier: async (chemin) => {
      dossiers.push(chemin);
    },
    renommer: async () => undefined,
    supprimer: async (chemin) => {
      fichiers.delete(chemin);
    },
  };
  return { connexion, fichiers, dossiers, etat };
}

describe('testerConnexion', () => {
  it('écrit, relit et supprime le fichier de test dans le dossier du vault', async () => {
    const { connexion, fichiers, dossiers, etat } = fausseConnexion();
    const resultat = await testerConnexion(connexion, 'Notes', () => 1000);
    expect(resultat.ok).toBe(true);
    expect(dossiers).toEqual(['Notes']);
    expect(fichiers.size).toBe(0);
    expect(resultat.etapes.map((etape) => etape.libelle)).toEqual([
      'Connexion et authentification',
      'Dossier du vault présent',
      'Écriture du fichier de test',
      'Relecture',
      'Suppression du fichier de test',
    ]);
    expect(etat.fermee).toBe(true);
  });

  it('ne crée aucun dossier quand le vault est à la racine du partage', async () => {
    const { connexion, dossiers } = fausseConnexion();
    expect((await testerConnexion(connexion, '')).ok).toBe(true);
    expect(dossiers).toEqual([]);
  });

  it("rapporte l'erreur du NAS et ferme la connexion", async () => {
    const { connexion, etat } = fausseConnexion({
      echecOuverture: new RemoteFsError('identifiants_refuses', 'identifiants refusés par le NAS'),
    });
    const resultat = await testerConnexion(connexion, 'Notes');
    expect(resultat).toMatchObject({ ok: false, etapes: [], erreur: { code: 'identifiants_refuses' } });
    expect(etat.fermee).toBe(true);
  });

  it('échoue si le contenu relu diffère', async () => {
    const { connexion } = fausseConnexion({ corrompre: true });
    expect(await testerConnexion(connexion, '')).toMatchObject({ ok: false, erreur: { code: 'interne' } });
  });

  it("échoue si une seule réponse du NAS n'était pas chiffrée", async () => {
    const { connexion } = fausseConnexion({ reponsesChiffrees: 11 });
    expect(await testerConnexion(connexion, '')).toMatchObject({ ok: false, erreur: { code: 'chiffrement_absent' } });
  });
});
