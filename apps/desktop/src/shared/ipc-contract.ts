import type { LocalFsErrorCode, NasSettings, NasSettingsField, PageLocation, RemoteFsErrorCode, TreeNode, VaultErrorCode } from '@notes/core';

/**
 * Contrat IPC entre le main, le preload et le renderer. Tout canal ajouté ici
 * doit avoir son handler dans src/main/ipc/ et sa méthode dans le preload.
 */
export const canaux = {
  version: 'app:version',
  lireEtatNas: 'nas:lire-etat',
  enregistrerNas: 'nas:enregistrer',
  oublierMotDePasse: 'nas:oublier-mot-de-passe',
  testerConnexion: 'nas:tester-connexion',
  etatVault: 'vault:etat',
  choisirDossierVault: 'vault:choisir-dossier',
  utiliserDossierPropose: 'vault:utiliser-dossier-propose',
  lireArbre: 'vault:lire-arbre',
  creerPage: 'vault:creer-page',
  renommerPage: 'vault:renommer-page',
  deplacerPage: 'vault:deplacer-page',
  dupliquerPage: 'vault:dupliquer-page',
  importer: 'vault:importer',
} as const;

/** Événements envoyés par le main au renderer. */
export const evenements = {
  /** Le contenu du vault a changé sur le disque : l'arbre est à relire. */
  vaultModifie: 'vault:modifie',
} as const;

export interface VaultState {
  /** Dossier du vault sur ce poste, null tant qu'il n'est pas choisi. */
  dossier: string | null;
  /** Dossier proposé par défaut au premier lancement. */
  dossierPropose: string;
}

/** Résultat d'une opération sur le vault : la page concernée et l'arbre à jour, ou l'erreur. */
export type VaultOperationResult =
  | { ok: true; page: PageLocation; arbre: TreeNode[] }
  | { ok: false; erreur: { code: VaultErrorCode | LocalFsErrorCode | 'requete_invalide' | 'interne'; message: string } };

/**
 * Où se trouve le mot de passe du NAS. Le renderer ne reçoit jamais le mot de
 * passe lui-même, seulement cet état.
 * - enregistre : chiffré sur le disque par le trousseau du système
 * - session : gardé en mémoire jusqu'à la fermeture, faute de trousseau
 * - absent : à saisir
 */
export type PasswordState = 'enregistre' | 'session' | 'absent';

export interface NasState {
  reglages: NasSettings | null;
  motDePasse: PasswordState;
  /** Faux si le système n'offre aucun trousseau pour chiffrer les secrets. */
  stockageChiffre: boolean;
}

export interface NasFormInput extends NasSettings {
  /** Absent ou vide : le mot de passe déjà connu est conservé. */
  motDePasse?: string;
}

export type NasSaveResult =
  | { ok: true; etat: NasState }
  | { ok: false; erreurs: Partial<Record<NasSettingsField | 'motDePasse', string>> };

export interface ConnectionTestStep {
  libelle: string;
  dureeMs: number;
}

/** Protection de la session SMB, telle que le compagnon l'a constatée. */
export interface SessionProtection {
  dialecte: string;
  signature: boolean;
  chiffrement: boolean;
  reponsesChiffrees: number;
  reponsesTotal: number;
}

export type ConnectionTestResult =
  | { ok: true; etapes: ConnectionTestStep[]; protection: SessionProtection }
  | { ok: false; etapes: ConnectionTestStep[]; erreur: { code: RemoteFsErrorCode | 'configuration'; message: string } };

/** API exposée au renderer sous window.notes. */
export interface NotesApi {
  version(): Promise<string>;
  lireEtatNas(): Promise<NasState>;
  enregistrerNas(saisie: NasFormInput): Promise<NasSaveResult>;
  oublierMotDePasse(): Promise<NasState>;
  testerConnexion(): Promise<ConnectionTestResult>;

  etatVault(): Promise<VaultState>;
  /** Ouvre le sélecteur de dossier. Rend l'état inchangé si l'utilisateur annule. */
  choisirDossierVault(): Promise<VaultState | Extract<VaultOperationResult, { ok: false }>>;
  utiliserDossierPropose(): Promise<VaultState | Extract<VaultOperationResult, { ok: false }>>;
  lireArbre(): Promise<TreeNode[]>;
  creerPage(demande: { parent: string; titre: string; index?: number }): Promise<VaultOperationResult>;
  renommerPage(demande: { chemin: string; titre: string }): Promise<VaultOperationResult>;
  deplacerPage(demande: { chemin: string; parent: string; index?: number }): Promise<VaultOperationResult>;
  dupliquerPage(demande: { chemin: string }): Promise<VaultOperationResult>;
  importer(demande: { chemin: string }): Promise<VaultOperationResult>;
  /** S'abonne aux modifications du vault. Renvoie la fonction de désabonnement. */
  surVaultModifie(ecouteur: () => void): () => void;
}
