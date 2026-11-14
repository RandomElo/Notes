import { changerConfigDeBase, changerValeurDeBase, couleursDeChoix, lireBase, renommerChampDeBase, renommerChoixDeBase, retirerChoixDeBase } from '@notes/core';
import type { BaseChoice, BaseConfig, BaseFieldType } from '@notes/core';
import type { DatabaseReadResult, TrashActionResult } from '../../shared/ipc-contract';
import type { VaultService } from '../vault/vault-service';
import { champs, estChemin, requeteInvalide, versErreur } from './vault';

export interface DatabaseHandlersDependencies {
  vault: VaultService;
  /** File des opérations sur le vault (ipc/vault.ts). */
  enSerie: <T>(tache: () => Promise<T>) => Promise<T>;
}

const typesDeChamp: readonly BaseFieldType[] = ['texte', 'etat', 'choix', 'case', 'nombre', 'courriel'];

/** La liste des choix d'un champ reçue du renderer, vérifiée dans sa forme. undefined : absente ; null : mal formée. */
function lireChoix(recus: unknown): BaseChoice[] | null | undefined {
  if (recus === undefined) {
    return undefined;
  }
  if (!Array.isArray(recus) || recus.length > 50) {
    return null;
  }
  const lus: BaseChoice[] = [];
  for (const choix of recus as unknown[]) {
    const { nom, couleur } = (typeof choix === 'object' && choix !== null ? choix : {}) as { nom?: unknown; couleur?: unknown };
    if (typeof nom !== 'string' || (couleur !== null && !(couleursDeChoix as readonly unknown[]).includes(couleur))) {
      return null;
    }
    lus.push({ nom: nom.trim(), couleur: couleur as BaseChoice['couleur'] });
  }
  return lus;
}

/** Une configuration de base reçue du renderer, vérifiée dans sa forme. Le sens (noms en double…) est vérifié par core. */
function lireConfig(recue: unknown): BaseConfig | null {
  if (typeof recue !== 'object' || recue === null) {
    return null;
  }
  const { champs: liste, tri, largeurs, repliees, lignes, vue } = recue as { champs?: unknown; tri?: unknown; largeurs?: unknown; repliees?: unknown; lignes?: unknown; vue?: unknown };
  if ((lignes !== undefined && lignes !== 'pages' && lignes !== 'tableau') || (vue !== undefined && vue !== 'liste')) {
    return null;
  }
  if (typeof largeurs !== 'object' || largeurs === null || Array.isArray(largeurs) || Object.values(largeurs).some((largeur) => typeof largeur !== 'number')) {
    return null;
  }
  if (!Array.isArray(liste) || liste.length > 30) {
    return null;
  }
  if (repliees !== undefined && (!Array.isArray(repliees) || repliees.some((id) => typeof id !== 'string'))) {
    return null;
  }
  const replieesLues = { ...(repliees === undefined ? {} : { repliees: repliees as string[] }), ...(lignes === 'tableau' ? { lignes: 'tableau' as const } : {}), ...(vue === 'liste' ? { vue: 'liste' as const } : {}) };
  const champsLus: BaseConfig['champs'] = [];
  for (const champ of liste as unknown[]) {
    const { nom, type, choix } = (typeof champ === 'object' && champ !== null ? champ : {}) as { nom?: unknown; type?: unknown; choix?: unknown };
    const choixLus = lireChoix(choix);
    if (typeof nom !== 'string' || !typesDeChamp.includes(type as BaseFieldType) || choixLus === null) {
      return null;
    }
    champsLus.push({ nom: nom.trim(), type: type as BaseFieldType, ...(choixLus === undefined ? {} : { choix: choixLus }) });
  }
  const largeursLues = largeurs as Record<string, number>;
  if (tri === null) {
    return { champs: champsLus, tri: null, largeurs: largeursLues, ...replieesLues };
  }
  const { champ, sens } = (typeof tri === 'object' && tri !== null ? tri : {}) as { champ?: unknown; sens?: unknown };
  if (typeof champ !== 'string' || (sens !== 'croissant' && sens !== 'decroissant')) {
    return null;
  }
  return { champs: champsLus, tri: { champ, sens }, largeurs: largeursLues, ...replieesLues };
}

/** Handlers des canaux « base: » (docs/spec/base-de-donnees.md). Les entrées viennent du renderer : rien n'est supposé valide. */
export function creerHandlersBase({ vault, enSerie }: DatabaseHandlersDependencies) {
  const action = (tache: () => Promise<void>): Promise<TrashActionResult> =>
    enSerie(async () => {
      try {
        await tache();
        return { ok: true };
      } catch (erreur) {
        return { ok: false, erreur: versErreur(erreur) };
      }
    });

  return {
    lire: (demande: unknown): Promise<DatabaseReadResult> => {
      const { chemin } = champs(demande);
      if (!estChemin(chemin)) {
        return Promise.resolve(requeteInvalide());
      }
      return enSerie(async () => {
        try {
          return { ok: true, ...(await lireBase(vault.contexte().fs, chemin)) };
        } catch (erreur) {
          return { ok: false, erreur: versErreur(erreur) };
        }
      });
    },

    changerConfig: (demande: unknown): Promise<TrashActionResult> => {
      const { chemin, config } = champs(demande);
      const lue = lireConfig(config);
      if (!estChemin(chemin) || lue === null) {
        return Promise.resolve(requeteInvalide());
      }
      return action(() => changerConfigDeBase(vault.contexte(), chemin, lue));
    },

    changerValeur: (demande: unknown): Promise<TrashActionResult> => {
      const { base, ligne, champ, valeur } = champs(demande);
      if (!estChemin(base) || !estChemin(ligne) || typeof champ !== 'string' || typeof valeur !== 'string' || valeur.length > 1000) {
        return Promise.resolve(requeteInvalide());
      }
      return action(() => changerValeurDeBase(vault.contexte(), base, ligne, champ, valeur));
    },

    renommerChamp: (demande: unknown): Promise<TrashActionResult> => {
      const { chemin, ancien, nouveau } = champs(demande);
      if (!estChemin(chemin) || typeof ancien !== 'string' || typeof nouveau !== 'string') {
        return Promise.resolve(requeteInvalide());
      }
      return action(() => renommerChampDeBase(vault.contexte(), chemin, ancien, nouveau));
    },

    renommerChoix: (demande: unknown): Promise<TrashActionResult> => {
      const { chemin, champ, ancien, nouveau } = champs(demande);
      if (!estChemin(chemin) || typeof champ !== 'string' || typeof ancien !== 'string' || typeof nouveau !== 'string') {
        return Promise.resolve(requeteInvalide());
      }
      return action(() => renommerChoixDeBase(vault.contexte(), chemin, champ, ancien, nouveau));
    },

    retirerChoix: (demande: unknown): Promise<TrashActionResult> => {
      const { chemin, champ, nom } = champs(demande);
      if (!estChemin(chemin) || typeof champ !== 'string' || typeof nom !== 'string') {
        return Promise.resolve(requeteInvalide());
      }
      return action(() => retirerChoixDeBase(vault.contexte(), chemin, champ, nom));
    },
  };
}
