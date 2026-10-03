import type { ConflictVersions, ImageToConvert, LocalFsErrorCode, LockState, NasSettings, NasSettingsField, PageLocation, RemoteFsErrorCode, SaveRequest, SaveResult, SyncStatus, TakeResult, TreeNode, VaultErrorCode } from '@notes/core';

/**
 * Contrat IPC entre le main, le preload et le renderer. Tout canal ajouté ici
 * doit avoir son handler dans src/main/ipc/ et sa méthode dans le preload.
 */
export const canaux = {
  version: 'app:version',
  reduireFenetre: 'fenetre:reduire',
  basculerAgrandissementFenetre: 'fenetre:basculer-agrandissement',
  fermerFenetre: 'fenetre:fermer',
  fenetreEstAgrandie: 'fenetre:est-agrandie',
  confirmerFermeture: 'fenetre:confirmer-fermeture',
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
  supprimerPageVide: 'vault:supprimer-page-vide',
  importer: 'vault:importer',
  lirePage: 'vault:lire-page',
  enregistrerPage: 'vault:enregistrer-page',
  listerConflits: 'vault:lister-conflits',
  lireConflit: 'vault:lire-conflit',
  resoudreConflit: 'vault:resoudre-conflit',
  lireTheme: 'theme:lire',
  creerTheme: 'theme:creer',
  ouvrirTheme: 'theme:ouvrir',
  enregistrerTheme: 'theme:enregistrer',
  lireEtatSync: 'sync:lire-etat',
  synchroniserMaintenant: 'sync:synchroniser',
  etatVerrou: 'sync:etat-verrou',
  prendreVerrou: 'sync:prendre-verrou',
  quitterPage: 'sync:quitter-page',
  montrerFichier: 'sync:montrer-fichier',
  choisirImages: 'images:choisir',
  ajouterImage: 'images:ajouter',
  telechargerImage: 'images:telecharger',
  listerImagesAConvertir: 'images:a-convertir',
  lireImage: 'images:lire',
  convertirImage: 'images:convertir',
  listerImagesOrphelines: 'images:orphelines',
} as const;

/**
 * Schéma des adresses d'images de la page : `notes-asset://vault/<chemin>`,
 * chemin relatif au dossier des notes, chaque morceau encodé. Le main ne sert
 * que des fichiers d'image du dossier des notes.
 */
export const schemaDesImages = 'notes-asset';

/** Événements envoyés par le main au renderer. */
export const evenements = {
  /** Le contenu du vault a changé sur le disque : l'arbre est à relire. */
  vaultModifie: 'vault:modifie',
  /** La fenêtre vient d'être agrandie ou restaurée. Porte le nouvel état. */
  fenetreAgrandie: 'fenetre:agrandie',
  /** L'utilisateur ferme la fenêtre : le renderer enregistre ce qui ne l'est pas, puis confirme. */
  fermetureDemandee: 'fenetre:fermeture-demandee',
  /** L'état de la sync a changé (début ou fin d'un cycle, NAS injoignable). Porte le nouvel état. */
  etatSyncModifie: 'sync:etat-modifie',
} as const;

/** Verrou d'une page vu du renderer : « inconnu » quand la sync est coupée ou le NAS injoignable. */
export type LockView = LockState | { etat: 'inconnu' };

export type { SyncStatus, TakeResult };

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

export type VaultFailure = Extract<VaultOperationResult, { ok: false }>;

/** Corps Markdown d'une page (sans son front-matter) et ses surcharges de thème non vérifiées, ou l'erreur. */
export type PageReadResult = { ok: true; corps: string; surcharges: Record<string, string> } | VaultFailure;

/** Le fichier de thème du dossier des notes, tel qu'il est sur le disque. */
export interface ThemeFile {
  /** Texte de `.notes/theme.toml`. null s'il n'existe pas : le thème par défaut s'applique. */
  texte: string | null;
  /** Emplacement du fichier sur ce poste, qu'il existe ou non. null si aucun dossier de notes n'est ouvert. */
  chemin: string | null;
  /** Pourquoi le fichier n'a pas pu être lu, s'il existe. */
  erreur: string | null;
}

/** Résultat d'une action sur le fichier de thème : fait, ou la raison de l'échec. */
export type ThemeActionResult = { ok: true } | { ok: false; message: string };

/** Images copiées dans le dossier `assets/` de la page : l'adresse à écrire dans la page pour chacune. */
export type ImagesAddResult = { ok: true; adresses: string[] } | VaultFailure;

/** Images reçues (choisies ou téléchargées), pas encore copiées : le renderer les convertit en WebP d'abord. */
export type ImagesReceivedResult = { ok: true; fichiers: { nom: string | null; octets: Uint8Array }[] } | VaultFailure;

/** Octets d'une image du dossier des notes, pour la convertir. */
export type ImageReadResult = { ok: true; octets: Uint8Array } | VaultFailure;

/** Résultat d'un enregistrement : écrit ou non, et le nom de la sauvegarde de conflit s'il y en a eu une. */
export type PageSaveResult = ({ ok: true } & SaveResult) | VaultFailure;

/** Les deux versions d'une page en conflit : la page (A) et la version mise de côté (B). */
export type ConflictReadResult = ({ ok: true } & ConflictVersions) | VaultFailure;

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

  reduireFenetre(): Promise<void>;
  /** Agrandit ou restaure la fenêtre. Renvoie vrai si elle est maintenant agrandie. */
  basculerAgrandissementFenetre(): Promise<boolean>;
  fermerFenetre(): Promise<void>;
  fenetreEstAgrandie(): Promise<boolean>;
  surFenetreAgrandie(ecouteur: (agrandie: boolean) => void): () => void;
  /** S'abonne à la demande de fermeture de la fenêtre. L'abonné répond par confirmerFermeture. */
  surFermetureDemandee(ecouteur: () => void): () => void;
  /** Ferme la fenêtre pour de bon, une fois les enregistrements en cours terminés. */
  confirmerFermeture(): Promise<void>;

  lireEtatNas(): Promise<NasState>;
  enregistrerNas(saisie: NasFormInput): Promise<NasSaveResult>;
  oublierMotDePasse(): Promise<NasState>;
  testerConnexion(): Promise<ConnectionTestResult>;

  etatVault(): Promise<VaultState>;
  /** Ouvre le sélecteur de dossier. Rend l'état inchangé si l'utilisateur annule. */
  choisirDossierVault(): Promise<VaultState | VaultFailure>;
  utiliserDossierPropose(): Promise<VaultState | VaultFailure>;
  lireArbre(): Promise<TreeNode[]>;
  creerPage(demande: { parent: string; titre: string; index?: number }): Promise<VaultOperationResult>;
  renommerPage(demande: { chemin: string; titre: string }): Promise<VaultOperationResult>;
  deplacerPage(demande: { chemin: string; parent: string; index?: number }): Promise<VaultOperationResult>;
  dupliquerPage(demande: { chemin: string }): Promise<VaultOperationResult>;
  /** Supprime une page sans contenu, sous-page ni fichier. Refusée (`page_non_vide`) sinon. */
  supprimerPageVide(demande: { chemin: string }): Promise<VaultOperationResult>;
  importer(demande: { chemin: string }): Promise<VaultOperationResult>;
  /** Lit le corps d'une page ou d'un élément non importé. Ne modifie rien. */
  lirePage(demande: { chemin: string }): Promise<PageReadResult>;
  /** Enregistre le corps d'une page importée, sans jamais écraser une version modifiée ailleurs. */
  enregistrerPage(demande: { chemin: string } & SaveRequest): Promise<PageSaveResult>;
  /** Versions en conflit gardées à côté d'une page (`page.conflit-[date].md`). Liste vide si la page n'en a pas. */
  listerConflits(demande: { chemin: string }): Promise<string[]>;
  /** Lit une page et une de ses versions en conflit. Ne modifie rien. */
  lireConflit(demande: { sauvegarde: string }): Promise<ConflictReadResult>;
  /** Enregistre la page résolue, puis supprime la version en conflit. */
  resoudreConflit(demande: { sauvegarde: string } & SaveRequest): Promise<PageSaveResult>;
  /** Lit le fichier de thème. Ne modifie rien. */
  lireTheme(): Promise<ThemeFile>;
  /** Crée le fichier de thème avec les valeurs par défaut, s'il n'existe pas. Ne remplace jamais un fichier existant. */
  creerTheme(): Promise<ThemeActionResult>;
  /** Ouvre le fichier de thème dans l'éditeur de texte du système. */
  ouvrirTheme(): Promise<ThemeActionResult>;
  /** Écrit le fichier de thème à partir des réglages faits dans l'application. Le main revérifie chaque valeur. */
  enregistrerTheme(theme: unknown): Promise<ThemeActionResult>;
  /** S'abonne aux modifications du vault. Renvoie la fonction de désabonnement. */
  surVaultModifie(ecouteur: () => void): () => void;

  lireEtatSync(): Promise<SyncStatus>;
  /** Lance un cycle tout de suite et rend l'état à sa fin. */
  synchroniserMaintenant(): Promise<SyncStatus>;
  surEtatSync(ecouteur: (etat: SyncStatus) => void): () => void;
  /** Qui édite la page, d'après son verrou sur le NAS. Ne modifie rien. */
  etatVerrou(demande: { chemin: string }): Promise<LockView>;
  /** À la frappe : pose ou entretient le verrou de la page. « forcer » prend le verrou d'un autre appareil. */
  prendreVerrou(demande: { chemin: string; forcer?: boolean }): Promise<TakeResult>;
  /** La page n'est plus ouverte : son verrou est rendu dès qu'elle est sur le NAS. */
  quitterPage(demande: { chemin: string }): Promise<void>;
  /** Montre un fichier du dossier des notes dans le gestionnaire de fichiers (sauvegarde de conflit, image inutilisée). */
  montrerFichier(demande: { chemin: string }): Promise<void>;

  /** Ouvre le sélecteur de fichiers et rend les images choisies, sans les copier. Aucune si l'utilisateur annule. */
  choisirImages(): Promise<ImagesReceivedResult>;
  /** Copie dans la page une image collée ou déposée. « nom » : le nom du fichier d'origine, null pour une image collée. */
  ajouterImage(demande: { chemin: string; nom: string | null; octets: Uint8Array }): Promise<ImagesAddResult>;
  /** Télécharge une image d'Internet (http ou https) et la rend, sans la copier. Le message dit pourquoi en cas d'échec. */
  telechargerImage(demande: { adresse: string }): Promise<ImagesReceivedResult>;
  /** Images du dossier des notes à convertir en WebP (PNG, JPEG, AVIF affichées par une page). Ne modifie rien. */
  listerImagesAConvertir(): Promise<ImageToConvert[]>;
  /** Octets d'une image du dossier `assets/` d'une page. */
  lireImage(demande: { page: string; nom: string }): Promise<ImageReadResult>;
  /** Ajoute la version WebP d'une image et fait renvoyer la page à elle. L'ancien fichier reste. */
  convertirImage(demande: { page: string; ancien: string; octets: Uint8Array }): Promise<ImagesAddResult>;
  /** Les images des dossiers `assets/` auxquelles leur page ne renvoie plus. Ne modifie rien. */
  listerImagesOrphelines(): Promise<string[]>;
}
