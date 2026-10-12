import {
  RemoteFsError,
  estNomDEntree,
  lireApercu,
  lireArbre,
  listerCorbeille,
  mettreALaCorbeille,
  mettreImageALaCorbeille,
  purgerCorbeille,
  rapatrierEntree,
  restaurerEntree,
  stockageDistant,
  stockageLocal,
  supprimerEntree,
  verifierCheminRelatif,
  viderCorbeille,
} from '@notes/core';
import type { PageLocation, RemoteFs, TrashEntry } from '@notes/core';
import type { TrashActionResult, TrashListResult, TrashPlace, TrashPreviewResult, TrashRestoreResult, VaultFailure, VaultOperationResult } from '../../shared/ipc-contract';
import type { SerialQueue } from '../vault/serial-queue';
import type { VaultService } from '../vault/vault-service';
import { champs, estChemin, requeteInvalide, versErreur } from './vault';

export interface TrashHandlersDependencies {
  vault: VaultService;
  /** File partagée avec les autres opérations sur le vault et la sync. */
  file: SerialQueue;
  /** Action sur le dossier des notes du NAS ; null si le NAS n'est pas réglé ou le poste hors ligne. */
  avecNas: <T>(action: (distant: RemoteFs) => Promise<T>) => Promise<T | null>;
  maintenant?: () => number;
}

/** Au-delà, la demande est refusée : une sélection de l'arborescence, pas tout le dossier des notes. */
const maxPagesParSuppression = 500;

/**
 * Handlers des canaux « corbeille: » (docs/spec/corbeille.md). Ce qui touche la corbeille
 * du poste passe par la file du vault ; la corbeille du NAS passe par la
 * connexion de la sync. Les entrées viennent du renderer : rien n'est supposé valide.
 */
export function creerHandlersCorbeille({ vault, file, avecNas, maintenant = Date.now }: TrashHandlersDependencies) {
  const { enSerie } = file;

  /** Exécute une action sur le NAS. « injoignable » s'il ne répond pas, « non_regle » s'il n'est pas réglé. */
  const surLeNas = async <T>(action: (distant: RemoteFs) => Promise<T>): Promise<{ ok: true; valeur: T } | { ok: false; raison: 'non_regle' | 'injoignable' }> => {
    try {
      const resultat = await avecNas(async (distant) => ({ valeur: await action(distant) }));
      return resultat === null ? { ok: false, raison: 'non_regle' } : { ok: true, valeur: resultat.valeur };
    } catch (erreur) {
      if (erreur instanceof RemoteFsError && erreur.code !== 'introuvable') {
        return { ok: false, raison: 'injoignable' };
      }
      throw erreur;
    }
  };

  return {
    /** Purge du démarrage : la corbeille du poste ici, celle du NAS au premier cycle de la sync. */
    purgerAuDemarrage: (): Promise<void> =>
      enSerie(async () => {
        const fs = vault.fsOuNull();
        if (fs !== null) {
          await purgerCorbeille(stockageLocal(fs), maintenant()).catch(() => 0);
        }
      }),

    mettre: (demande: unknown): Promise<VaultOperationResult> => {
      const { chemins } = champs(demande);
      if (!Array.isArray(chemins) || chemins.length === 0 || chemins.length > maxPagesParSuppression || !chemins.every(estChemin)) {
        return Promise.resolve(requeteInvalide());
      }
      return enSerie(async () => {
        try {
          const contexte = vault.contexte();
          // Une page dont un ancêtre part aussi s'en va avec lui.
          const racines = chemins.filter((chemin) => !chemins.some((autre) => autre !== chemin && chemin.startsWith(`${autre}/`)));
          let premiere: PageLocation | null = null;
          for (const chemin of racines) {
            const page = await mettreALaCorbeille(contexte, chemin);
            premiere ??= page;
          }
          return { ok: true, page: premiere ?? { chemin: '', id: '' }, arbre: await lireArbre(contexte.fs) };
        } catch (erreur) {
          return { ok: false, erreur: versErreur(erreur) };
        }
      });
    },

    mettreImage: (demande: unknown): Promise<TrashActionResult> => {
      const { chemin } = champs(demande);
      if (!estChemin(chemin)) {
        return Promise.resolve(requeteInvalide());
      }
      return enSerie(async () => {
        try {
          await mettreImageALaCorbeille(vault.contexte(), chemin);
          return { ok: true };
        } catch (erreur) {
          return { ok: false, erreur: versErreur(erreur) };
        }
      });
    },

    lister: async (): Promise<TrashListResult> => {
      const fs = vault.fsOuNull();
      if (fs === null) {
        return { entrees: [], nas: 'non_regle' };
      }
      const locales = await enSerie(() => listerCorbeille(stockageLocal(fs)).catch(() => [] as TrashEntry[]));
      const distantes = await surLeNas((distant) => listerCorbeille(stockageDistant(distant))).catch(() => ({ ok: false as const, raison: 'injoignable' as const }));
      // Une entrée en cours de transfert est des deux côtés : on la montre une fois, sur le poste.
      const surLePoste = new Set(locales.map((entree) => entree.entree));
      const entrees = [
        ...locales.map((entree) => ({ ...entree, emplacement: 'poste' as const })),
        ...(distantes.ok ? distantes.valeur.filter((entree) => !surLePoste.has(entree.entree)).map((entree) => ({ ...entree, emplacement: 'nas' as const })) : []),
      ].sort((a, b) => (a.supprimeLe < b.supprimeLe ? 1 : a.supprimeLe > b.supprimeLe ? -1 : 0));
      return { entrees, nas: distantes.ok ? 'joignable' : distantes.raison };
    },

    apercu: async (demande: unknown): Promise<TrashPreviewResult> => {
      const cible = cibleDe(demande);
      if (cible === null) {
        return requeteInvalide();
      }
      try {
        if (cible.emplacement === 'poste') {
          return { ok: true, ...(await enSerie(() => lireApercu(stockageLocal(vault.contexte().fs), cible.entree))) };
        }
        const lu = await surLeNas((distant) => lireApercu(stockageDistant(distant), cible.entree));
        return lu.ok ? { ok: true, ...lu.valeur } : nasIndisponible(lu.raison);
      } catch (erreur) {
        return { ok: false, erreur: versErreur(erreur) };
      }
    },

    restaurer: (demande: unknown): Promise<TrashRestoreResult> => {
      const cible = cibleDe(demande);
      if (cible === null) {
        return Promise.resolve(requeteInvalide());
      }
      // Rapatriement et restauration d'un seul tenant : la sync ne doit pas renvoyer l'entrée au NAS entre les deux.
      return enSerie(async () => {
        try {
          const contexte = vault.contexte();
          if (cible.emplacement === 'nas') {
            const rapatriee = await surLeNas((distant) => rapatrierEntree(contexte.fs, distant, cible.entree));
            if (!rapatriee.ok) {
              return nasIndisponible(rapatriee.raison);
            }
          }
          const page = await restaurerEntree(contexte, cible.entree);
          return { ok: true, page, arbre: await lireArbre(contexte.fs) };
        } catch (erreur) {
          return { ok: false, erreur: versErreur(erreur) };
        }
      });
    },

    supprimer: async (demande: unknown): Promise<TrashActionResult> => {
      const cible = cibleDe(demande);
      if (cible === null) {
        return requeteInvalide();
      }
      try {
        if (cible.emplacement === 'poste') {
          await enSerie(() => supprimerEntree(stockageLocal(vault.contexte().fs), cible.entree));
          return { ok: true };
        }
        const fait = await surLeNas((distant) => supprimerEntree(stockageDistant(distant), cible.entree));
        return fait.ok ? { ok: true } : nasIndisponible(fait.raison);
      } catch (erreur) {
        return { ok: false, erreur: versErreur(erreur) };
      }
    },

    /** Vide les deux corbeilles. Celle du NAS reste pleine s'il ne répond pas, et le résultat le dit. */
    vider: async (): Promise<TrashActionResult> => {
      try {
        await enSerie(() => viderCorbeille(stockageLocal(vault.contexte().fs)));
        const fait = await surLeNas((distant) => viderCorbeille(stockageDistant(distant)));
        return fait.ok || fait.raison === 'non_regle' ? { ok: true } : nasIndisponible(fait.raison);
      } catch (erreur) {
        return { ok: false, erreur: versErreur(erreur) };
      }
    },
  };
}

function cibleDe(demande: unknown): { entree: string; emplacement: TrashPlace } | null {
  const { entree, emplacement } = champs(demande);
  if (!estNomDEntree(entree) || verifierCheminRelatif(entree) !== null || (emplacement !== 'poste' && emplacement !== 'nas')) {
    return null;
  }
  return { entree, emplacement };
}

function nasIndisponible(raison: 'non_regle' | 'injoignable'): VaultFailure {
  return {
    ok: false,
    erreur: {
      code: 'nas_indisponible',
      message: raison === 'injoignable' ? 'Le NAS ne répond pas : réessaie quand il est joignable.' : "La connexion au NAS n'est pas réglée.",
    },
  };
}
