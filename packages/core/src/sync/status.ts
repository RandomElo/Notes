import type { RemoteFsErrorCode } from '../fs/remote-fs';
import type { CycleReport } from './engine';

/**
 * État de la sync affiché dans la barre de statut (README §5). « desactivee »
 * s'ajoute aux cinq états du README : NAS pas réglé ou mot de passe à saisir.
 */
export type SyncStatusKind = 'desactivee' | 'en_cours' | 'synchronise' | 'en_attente' | 'injoignable' | 'conflit';

export interface SyncStatus {
  etat: SyncStatusKind;
  /** Phrase courte, en français, pour la barre de statut et son panneau. */
  message: string;
  /** Fin du dernier cycle réussi, en millisecondes depuis l'époque Unix. */
  derniereSync: number | null;
  /** Premier échec de la série en cours quand le NAS ne répond pas, null sinon. */
  injoignableDepuis: number | null;
  /** Sauvegardes de conflit présentes dans le dossier des notes. */
  sauvegardes: string[];
  erreurs: { chemin: string; message: string }[];
  /** Fichiers que SMB refuserait à cause de leur nom. */
  refuses: string[];
}

export function etatDesactive(message: string): SyncStatus {
  return { etat: 'desactivee', message, derniereSync: null, injoignableDepuis: null, sauvegardes: [], erreurs: [], refuses: [] };
}

export function etatEnCours(precedent: SyncStatus): SyncStatus {
  return { ...precedent, etat: 'en_cours', message: 'Synchronisation en cours' };
}

export function etatApresCycle(rapport: CycleReport, fin: number): SyncStatus {
  const base = { derniereSync: fin, injoignableDepuis: null, sauvegardes: rapport.sauvegardes, erreurs: rapport.erreurs, refuses: rapport.refuses };
  if (rapport.sauvegardes.length > 0) {
    const nombre = rapport.sauvegardes.length;
    return { ...base, etat: 'conflit', message: nombre === 1 ? 'Une version en conflit gardée à côté' : `${nombre} versions en conflit gardées à côté` };
  }
  if (rapport.reportes.length > 0 || rapport.erreurs.length > 0) {
    return { ...base, etat: 'en_attente', message: 'Des fichiers restent à synchroniser' };
  }
  return { ...base, etat: 'synchronise', message: 'Synchronisé' };
}

/** Message de l'état injoignable quand le NAS ne répond simplement pas. */
export const messageInjoignable = 'NAS injoignable';

const messagesDEchec: Partial<Record<RemoteFsErrorCode, string>> = {
  identifiants_refuses: 'Identifiants refusés par le NAS',
  partage_introuvable: 'Partage introuvable sur le NAS',
  chiffrement_absent: 'Connexion refusée : le NAS ne chiffre pas les échanges',
  acces_refuse: 'Accès refusé par le NAS',
};

/**
 * Le cycle n'a pas pu aller au bout : NAS injoignable ou session refusée. Le
 * reste de l'état précédent est gardé, et l'heure du premier échec d'une
 * série aussi (« NAS injoignable depuis 19:02 »).
 */
export function etatApresEchec(code: RemoteFsErrorCode, precedent: SyncStatus, instant: number): SyncStatus {
  return { ...precedent, etat: 'injoignable', message: messagesDEchec[code] ?? messageInjoignable, injoignableDepuis: precedent.injoignableDepuis ?? instant };
}
