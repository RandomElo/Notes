import { verifierCheminRelatif } from '@notes/core';
import type { SyncStatus, TakeResult } from '@notes/core';
import type { LockView } from '../../shared/ipc-contract';
import type { SyncScheduler } from '../sync/scheduler';

export interface SyncHandlersDependencies {
  sync: Pick<SyncScheduler, 'etat' | 'synchroniser' | 'etatVerrou' | 'prendreVerrou' | 'quitterPage'>;
  /** Montre un fichier du vault (chemin relatif déjà vérifié) dans le gestionnaire de fichiers. */
  montrerFichier: (chemin: string) => void;
}

/** Handlers des canaux « sync: ». Les entrées viennent du renderer : rien n'est supposé valide. */
export function creerHandlersSync({ sync, montrerFichier }: SyncHandlersDependencies) {
  return {
    lireEtat: async (): Promise<SyncStatus> => sync.etat(),

    synchroniser: async (): Promise<SyncStatus> => {
      await sync.synchroniser();
      return sync.etat();
    },

    etatVerrou: async (demande: unknown): Promise<LockView> => {
      const chemin = cheminDe(demande);
      return chemin === null ? { etat: 'inconnu' } : sync.etatVerrou(chemin);
    },

    prendreVerrou: async (demande: unknown): Promise<TakeResult> => {
      const chemin = cheminDe(demande);
      if (chemin === null) {
        return { ok: false, nom: '' };
      }
      const forcer = (demande as { forcer?: unknown }).forcer === true;
      return sync.prendreVerrou(chemin, forcer);
    },

    quitterPage: async (demande: unknown): Promise<void> => {
      const chemin = cheminDe(demande);
      if (chemin !== null) {
        // Le cycle peut prendre quelques secondes : le renderer n'a pas à l'attendre.
        void sync.quitterPage(chemin).catch(() => undefined);
      }
    },

    montrerFichier: async (demande: unknown): Promise<void> => {
      const chemin = cheminDe(demande);
      if (chemin !== null) {
        montrerFichier(chemin);
      }
    },
  };
}

function cheminDe(demande: unknown): string | null {
  if (typeof demande !== 'object' || demande === null) {
    return null;
  }
  const chemin = (demande as { chemin?: unknown }).chemin;
  return typeof chemin === 'string' && verifierCheminRelatif(chemin) === null ? chemin : null;
}
