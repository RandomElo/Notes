import type { LocalFs, NasSettings, RemoteFs } from '@notes/core';
import type { ReglagesSmb, SessionSmb } from './plugins';

/**
 * Tout ce que l'application demande à la plateforme. Sur le téléphone, les
 * plugins natifs ; dans un navigateur, en développement seulement, une
 * démonstration sur le vault d'exemple (demo.ts).
 */
export interface Environnement {
  /** Le cache du vault. */
  local: LocalFs;
  /** La racine du partage SMB. */
  distant: RemoteFs;
  /** Petits fichiers de l'application (réglages, index du cache), hors du vault. */
  fichiers: { lire(chemin: string): Promise<string | null>; ecrire(chemin: string, texte: string): Promise<void> };
  connecter(reglages: NasSettings, options: Pick<ReglagesSmb, 'hoteTailscale'> & { motDePasse?: string; rouvrir?: boolean }): Promise<SessionSmb>;
  deconnecter(): Promise<void>;
  motDePasseEnregistre(): Promise<boolean>;
  oublierMotDePasse(): Promise<void>;
  /** Faux quand le téléphone n'a aucun réseau. */
  reseauPresent(): Promise<boolean>;
  /** Abonne aux retours au premier plan et aux changements de réseau. Rend le désabonnement. */
  surOccasionDeSync(rappel: (raison: 'premier-plan' | 'reseau') => void, surArrierePlan: () => void): () => void;
  /** Ouvre une adresse web dans le navigateur du téléphone. */
  ouvrirLien(adresse: string): Promise<void>;
  /** Abonne au bouton Retour d'Android. */
  surRetour(rappel: () => void): () => void;
  /** Ferme l'application (Retour sur l'écran d'accueil). */
  quitter(): void;
  /** Le premier écran est dessiné : l'écran de démarrage s'efface. */
  contenuAffiche(): void;
  /** Mémos vocaux terminés, pas encore envoyés sur le NAS : dossier privé, hors du cache (J17). */
  memosEnAttente: LocalFs;
  enregistreur: Enregistreur;
}

/** Où en est l'enregistrement d'un mémo. */
export interface EtatEnregistrement {
  enCours: boolean;
  /** Début de l'enregistrement en cours, en millisecondes. */
  depuis: number;
  /** Niveau du son depuis la dernière question, entre 0 et 1. */
  niveau: number;
  /** Le dernier mémo n'a pas pu être gardé (terminé depuis la notification) : message à montrer, une fois. */
  erreur: string | null;
}

/** Enregistrement des mémos vocaux (README §13). Il continue écran éteint, avec sa notification. */
export interface Enregistreur {
  /** Lève une erreur au message à montrer (micro refusé, occupé). */
  demarrer(nom: string): Promise<void>;
  /** Range le mémo dans `memosEnAttente`. Rend son nom, null s'il était trop court pour être gardé. */
  terminer(): Promise<string | null>;
  annuler(): Promise<void>;
  etat(): Promise<EtatEnregistrement>;
}

/** Dossier des mémos en attente dans le stockage privé (le même que `Recording.DOSSIER_EN_ATTENTE` côté Kotlin). */
export const dossierDesMemosEnAttente = 'memos';

/** Dossier du cache du vault dans le stockage privé. */
export const dossierDuCache = 'vault';
