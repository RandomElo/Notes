import type { MemoAcceptance, MemoConversion, MemoEstimate, MemosState, MemoTranscription, WhisperState } from './memos-contract';
import type { AiProgress, AiPromptResult, AiRequest, AiEstimateResult, AiRunResult, AiState, AiUsageView } from './ai-contract';
import type { AiSettings, BrokenMention, ConflictVersions, IgnoredRemark, ImageToConvert, LocalFsErrorCode, LockState, NasSettings, NasSettingsField, PageLocation, PageMode, RemoteFsErrorCode, SaveRequest, SaveResult, SyncStatus, TakeResult, TrashEntry, TrashPreview, TreeNode, VaultErrorCode } from '@notes/core';

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
  deplacerPages: 'vault:deplacer-pages',
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
  pagesEnAttente: 'sync:pages-en-attente',
  quitterNotes: 'lancement:quitter',
  prendrePageDemandee: 'lancement:prendre-page',
  relancerNotes: 'maj:relancer',
  miseAJourEnAttente: 'maj:en-attente',
  choisirImages: 'images:choisir',
  ajouterImage: 'images:ajouter',
  telechargerImage: 'images:telecharger',
  listerImagesAConvertir: 'images:a-convertir',
  lireImage: 'images:lire',
  convertirImage: 'images:convertir',
  listerImagesOrphelines: 'images:orphelines',
  retirerLeFond: 'images:retirer-le-fond',
  copierImage: 'images:copier',
  apercuDuSite: 'liens:apercu-du-site',
  enregistrerFavicon: 'liens:enregistrer-favicon',
  listerMentionsCassees: 'vault:mentions-cassees',
  changerIcone: 'vault:changer-icone',
  ajouterIconeImage: 'vault:ajouter-icone-image',
  changerMode: 'vault:changer-mode',
  exporter: 'export:exporter',
  montrerExport: 'export:montrer',
  lireImageDExport: 'export:lire-image',
  mettreALaCorbeille: 'corbeille:mettre',
  mettreImageALaCorbeille: 'corbeille:mettre-image',
  listerCorbeille: 'corbeille:lister',
  apercuCorbeille: 'corbeille:apercu',
  restaurerDeLaCorbeille: 'corbeille:restaurer',
  supprimerDeLaCorbeille: 'corbeille:supprimer',
  viderCorbeille: 'corbeille:vider',
  etatCorrection: 'correction:etat',
  installerCorrection: 'correction:installer',
  annulerInstallationCorrection: 'correction:annuler-installation',
  desinstallerCorrection: 'correction:desinstaller',
  relancerCorrection: 'correction:relancer',
  chercherMiseAJourCorrection: 'correction:chercher-mise-a-jour',
  verifierOrthographe: 'correction:verifier',
  lireDictionnaire: 'correction:lire-dictionnaire',
  ajouterAuDictionnaire: 'correction:ajouter-au-dictionnaire',
  lireIgnores: 'correction:lire-ignores',
  ignorerRemarque: 'correction:ignorer',
  etatIa: 'ia:etat',
  enregistrerReglagesIa: 'ia:enregistrer-reglages',
  consigneIa: 'ia:consigne',
  estimerIa: 'ia:estimer',
  lancerIa: 'ia:lancer',
  annulerIa: 'ia:annuler',
  historiqueIa: 'ia:historique',
  etatMemos: 'memos:etat',
  masquerMemos: 'memos:masquer',
  lireMemo: 'memos:lire',
  transcrireMemo: 'memos:transcrire',
  accepterMemo: 'memos:accepter',
  ecarterMemo: 'memos:ecarter',
  convertirMemo: 'memos:convertir',
  ouvrirDossierMemos: 'memos:ouvrir-dossier',
  estimerMemos: 'memos:estimer',
  estimerMiseEnFormeMemo: 'memos:estimer-mise-en-forme',
  installerModeleWhisper: 'memos:installer-modele',
  annulerInstallationWhisper: 'memos:annuler-installation',
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
  /** Une page a été demandée par `--page=<id>` (barre de recherche du poste) : la fenêtre la prend et l'ouvre. */
  pageDemandee: 'lancement:page-demandee',
  /** Une nouvelle version de l'AppImage vient d'être installée : la barre de titre propose de relancer. */
  miseAJourInstallee: 'maj:installee',
  /** L'installation ou le serveur de la correction orthographique a changé d'état. Porte le nouvel état. */
  etatCorrectionModifie: 'correction:etat-modifie',
  /** Un appel IA en cours a reçu un morceau de réponse. Porte l'avancement. */
  avancementIa: 'ia:avancement',
  /** Un appel IA vient d'entrer dans l'historique : la dépense affichée est à relire. */
  historiqueIaModifie: 'ia:historique-modifie',
  /** Le modèle de transcription se télécharge, ou le serveur a démarré ou s'est arrêté. Porte l'état. */
  etatWhisperModifie: 'memos:etat-whisper',
} as const;

/** Une étape de l'installation de la correction orthographique : un fichier à télécharger, vérifier, décompresser. */
export interface SpellcheckStep {
  id: 'java' | 'languagetool' | 'ngrammes';
  libelle: string;
  etat: 'a_faire' | 'en_cours' | 'fait' | 'echec';
  phase: 'telechargement' | 'verification' | 'decompression' | null;
  /** Octets téléchargés, ou lus dans l'archive pendant la décompression. */
  fait: number;
  total: number;
}

/** Correction orthographique (README §11) : LanguageTool installé par Notes, lancé par elle. */
export interface SpellcheckState {
  installation: 'absente' | 'en_cours' | 'installee';
  serveur: 'arrete' | 'demarrage' | 'pret' | 'erreur';
  /** Dossier où LanguageTool est ou sera installé. */
  dossier: string;
  /** Taille totale à télécharger. */
  taille: number;
  /** Étapes de l'installation en cours, ou de la dernière ratée. Vide sinon. */
  etapes: SpellcheckStep[];
  /** Ce qui n'a pas marché (installation ou démarrage). */
  erreur: string | null;
  /** Versions installées, lisibles (`6.6`, `17.0.20.1`). null sans installation. */
  versions: { languagetool: string; java: string } | null;
  miseAJour: SpellcheckUpdate;
}

/** Mises à jour automatiques de LanguageTool et de son Java. */
export interface SpellcheckUpdate {
  enCours: boolean;
  /** Date de la dernière recherche, en millisecondes. */
  derniereVerification: number | null;
  /** Ce qu'elle a donné : à jour, mis à jour, version refusée, recherche impossible. */
  message: string | null;
}

/** Texte d'un bloc à vérifier. Les plages exclues (code, adresses, mentions) ne sont pas vérifiées. */
export interface SpellcheckRequest {
  texte: string;
  /** Plages [début, fin[ dans le texte, dans l'ordre, sans chevauchement. */
  exclus: [number, number][];
}

/** Une faute trouvée dans un bloc, positions dans son texte. */
export interface SpellIssue {
  de: number;
  a: number;
  /** Le passage souligné, tel qu'il était dans le texte vérifié. */
  mot: string;
  message: string;
  /** Identifiant de la règle de LanguageTool. */
  regle: string;
  /** Orthographe : souligné rouge ; grammaire, style et le reste : bleu. */
  nature: 'orthographe' | 'grammaire';
  suggestions: string[];
}

/** Verrou d'une page vu du renderer : « inconnu » quand la sync est coupée ou le NAS injoignable. */
export type LockView = LockState | { etat: 'inconnu' };

export type { BrokenMention, IgnoredRemark, SyncStatus, TakeResult };

export interface VaultState {
  /** Dossier du vault sur ce poste, null tant qu'il n'est pas choisi. */
  dossier: string | null;
  /** Dossier proposé par défaut au premier lancement. */
  dossierPropose: string;
}

/** Résultat d'une opération sur le vault : la page concernée et l'arbre à jour, ou l'erreur. */
export type VaultOperationResult =
  | { ok: true; page: PageLocation; arbre: TreeNode[] }
  | { ok: false; erreur: { code: VaultErrorCode | LocalFsErrorCode | 'requete_invalide' | 'nas_indisponible' | 'interne'; message: string } };

export type VaultFailure = Extract<VaultOperationResult, { ok: false }>;

/** Corps Markdown d'une page (sans son front-matter) et ses surcharges de thème non vérifiées, ou l'erreur. */
export type PageReadResult = { ok: true; corps: string; surcharges: Record<string, string>; enTete: string | null } | VaultFailure;

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

/** Titre et favicon (octets d'une image, ICO compris, à convertir en PNG) d'un site, pour une mention de site. */
export type SitePreviewResult = { ok: true; titre: string | null; favicon: Uint8Array | null } | { ok: false; message: string };

/** Favicon d'un site gardée dans `.notes/favicons/` : son chemin dans le dossier des notes. */
export type FaviconSaveResult = { ok: true; chemin: string } | VaultFailure;

/** Masque du sujet d'une icône : 0 pour le fond, 255 pour le sujet, un octet par pixel. Ou la raison de l'échec. */
export type BackgroundRemovalResult = { ok: true; masque: Uint8Array } | { ok: false; message: string };

/** Octets d'une image du dossier des notes, pour la convertir. */
export type ImageReadResult = { ok: true; octets: Uint8Array } | VaultFailure;

/** Résultat d'un enregistrement : écrit ou non, et le nom de la sauvegarde de conflit s'il y en a eu une. */
export type PageSaveResult = ({ ok: true } & SaveResult) | VaultFailure;

/** Les deux versions d'une page en conflit : la page (A) et la version mise de côté (B). */
export type ConflictReadResult = ({ ok: true } & ConflictVersions) | VaultFailure;

/** Où se trouve une entrée de la corbeille : encore sur le poste (pas encore transférée) ou sur le NAS. */
export type TrashPlace = 'poste' | 'nas';

/** Entrées des deux corbeilles, les plus récentes en premier, et ce qu'il en est du NAS. */
export interface TrashListResult {
  entrees: (TrashEntry & { emplacement: TrashPlace })[];
  nas: 'joignable' | 'injoignable' | 'non_regle';
}

export type TrashPreviewResult = ({ ok: true } & TrashPreview) | VaultFailure;

/** Entrée restaurée : où elle est revenue (l'identifiant est null pour une image) et l'arbre à jour. */
export type TrashRestoreResult = { ok: true; page: { chemin: string; id: string | null }; arbre: TreeNode[] } | VaultFailure;

export type TrashActionResult = { ok: true } | VaultFailure;

/** Formats de papier et marges d'un export PDF (README §9). */
export const formatsDePapier = ['A4', 'A5', 'Letter'] as const;
export type PaperFormat = (typeof formatsDePapier)[number];
export const margesDePage = ['etroites', 'normales', 'larges'] as const;
export type PageMargins = (typeof margesDePage)[number];

/**
 * Un export à enregistrer (README §9). « nom » : nom de fichier proposé, sans
 * extension. Le main demande où l'enregistrer, puis convertit (PDF, ZIP) et écrit.
 */
export type ExportRequest =
  | { format: 'markdown' | 'html'; nom: string; texte: string }
  | { format: 'pdf'; nom: string; titre: string; html: string; papier: PaperFormat; marges: PageMargins }
  | { format: 'zip'; nom: string; fichiers: { chemin: string; octets: Uint8Array }[] };

/** Résultat d'un export : le fichier écrit, l'abandon (boîte « Enregistrer sous » fermée) ou l'échec. */
export type ExportResult = { ok: true; chemin: string; nom: string } | { ok: false; annule: true } | { ok: false; annule: false; message: string };

/** Une image du dossier des notes pour un export, avec sa nature (`image/webp`…). */
export type ExportImageResult = { ok: true; octets: Uint8Array; type: string } | { ok: false };

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
  /**
   * Renomme une page. Les pages qui la mentionnent sont réécrites avec le nouveau titre,
   * sauf la page d'identifiant « sauf », ouverte dans l'éditeur, qui s'en charge.
   */
  renommerPage(demande: { chemin: string; titre: string; sauf?: string }): Promise<VaultOperationResult>;
  /** Mentions dont la page n'existe pas dans le dossier des notes. Ne modifie rien. */
  listerMentionsCassees(): Promise<BrokenMention[]>;
  /** Change l'icône d'une page (emoji, nom Lucide, image de ses `assets/`), ou la retire (null). */
  changerIcone(demande: { chemin: string; icone: string | null }): Promise<VaultOperationResult>;
  /** Copie une image déjà recadrée (128 × 128, WebP) dans les `assets/` de la page et en fait son icône. */
  ajouterIconeImage(demande: { chemin: string; octets: Uint8Array }): Promise<VaultOperationResult>;
  /** Passe une page en mode liste de tâches (`todo`) ou la ramène en page classique (null). Seul le front-matter change. */
  changerMode(demande: { chemin: string; mode: PageMode | null }): Promise<VaultOperationResult>;
  deplacerPage(demande: { chemin: string; parent: string; index?: number }): Promise<VaultOperationResult>;
  /** Déplace plusieurs pages ensemble, à la suite, dans l'ordre donné. Une page dont un ancêtre est aussi déplacé suit celui-ci. */
  deplacerPages(demande: { chemins: string[]; parent: string; index?: number }): Promise<VaultOperationResult>;
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
  /** Parmi ces pages, celles que le NAS n'a pas encore dans leur dernière version. Aucune si la sync n'est pas réglée. Ne contacte pas le NAS. */
  pagesEnAttente(demande: { chemins: string[] }): Promise<string[]>;

  /** Quitte Notes : la fenêtre enregistre et se ferme, la sync s'arrête. */
  quitterNotes(): Promise<void>;
  /** La page demandée par `--page=<id>`, une seule fois, null s'il n'y en a pas. */
  prendrePageDemandee(): Promise<string | null>;
  surPageDemandee(ecouteur: () => void): () => void;
  /** Vrai si une nouvelle version a été installée depuis le lancement (`npm run installer`). */
  miseAJourEnAttente(): Promise<boolean>;
  surMiseAJourInstallee(ecouteur: () => void): () => void;
  /** Enregistre, quitte et relance Notes sur la nouvelle version installée. */
  relancerNotes(): Promise<void>;

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
  /** Copie une image d'une page (« source », chemin dans le dossier des notes) dans les `assets/` d'une autre, sans rien remplacer. */
  copierImage(demande: { source: string; page: string }): Promise<ImagesAddResult>;
  /** Titre et favicon d'un site (http ou https, sans cookies, délai court), pour une mention de site. */
  apercuDuSite(demande: { adresse: string }): Promise<SitePreviewResult>;
  /** Garde la favicon d'un site (PNG) dans `.notes/favicons/`, sans remplacer celle qui y est. */
  enregistrerFavicon(demande: { hote: string; octets: Uint8Array }): Promise<FaviconSaveResult>;
  /** Détoure une icône : pixels RGBA d'un carré de 320 × 320, rend le masque du sujet. Local, sans réseau. */
  retirerLeFond(demande: { pixels: Uint8Array; cote: number }): Promise<BackgroundRemovalResult>;

  /** Demande où enregistrer l'export, puis l'écrit (PDF imprimé, ZIP assemblé par le main). */
  exporter(demande: ExportRequest): Promise<ExportResult>;
  /** Montre dans le gestionnaire de fichiers un fichier exporté depuis le lancement, et rien d'autre. */
  montrerExport(demande: { chemin: string }): Promise<void>;
  /** Octets d'une image du dossier des notes (chemin relatif à lui), pour la mettre dans un export. */
  lireImageDExport(demande: { chemin: string }): Promise<ExportImageResult>;

  /** Met des pages à la corbeille, chacune avec sa descendance (README §10). */
  mettreALaCorbeille(demande: { chemins: string[] }): Promise<VaultOperationResult>;
  /** Met une image d'un dossier `assets/` à la corbeille (image inutilisée). */
  mettreImageALaCorbeille(demande: { chemin: string }): Promise<TrashActionResult>;
  /** Entrées de la corbeille du poste et de celle du NAS. Ne modifie rien. */
  listerCorbeille(): Promise<TrashListResult>;
  /** Texte et sous-pages d'une page de la corbeille, ou octets d'une image. Ne modifie rien. */
  apercuCorbeille(demande: { entree: string; emplacement: TrashPlace }): Promise<TrashPreviewResult>;
  restaurerDeLaCorbeille(demande: { entree: string; emplacement: TrashPlace }): Promise<TrashRestoreResult>;
  supprimerDeLaCorbeille(demande: { entree: string; emplacement: TrashPlace }): Promise<TrashActionResult>;
  /** Vide la corbeille du poste et celle du NAS. */
  viderCorbeille(): Promise<TrashActionResult>;

  /** État de la correction orthographique : installée ou non, serveur prêt ou non. */
  etatCorrection(): Promise<SpellcheckState>;
  surEtatCorrection(ecouteur: (etat: SpellcheckState) => void): () => void;
  /** Télécharge, vérifie et installe LanguageTool, puis le lance. L'avancement arrive par surEtatCorrection. */
  installerCorrection(): Promise<SpellcheckState>;
  annulerInstallationCorrection(): Promise<void>;
  /** Arrête LanguageTool et supprime son dossier. */
  desinstallerCorrection(): Promise<SpellcheckState>;
  /** Relance LanguageTool après un arrêt imprévu. */
  relancerCorrection(): Promise<SpellcheckState>;
  /** Cherche tout de suite une nouvelle version de LanguageTool ou de Java. L'avancement arrive par surEtatCorrection. */
  chercherMiseAJourCorrection(): Promise<SpellcheckState>;
  /** Fautes d'un bloc. null si la correction n'est pas prête ou ne répond pas : rien n'est alors souligné. */
  verifierOrthographe(demande: SpellcheckRequest): Promise<SpellIssue[] | null>;
  /** Mots du dictionnaire personnel (`.notes/dictionary.txt`). */
  lireDictionnaire(): Promise<string[]>;
  /** Ajoute un mot au dictionnaire personnel. Rend la liste à jour. */
  ajouterAuDictionnaire(demande: { mot: string }): Promise<string[]>;
  /** Remarques écartées par « Ignorer » (`.notes/spelling-ignored.txt`, synchronisé). */
  lireIgnores(): Promise<IgnoredRemark[]>;
  /** Écarte une remarque pour toujours et partout. Rend la liste à jour. */
  ignorerRemarque(demande: IgnoredRemark): Promise<IgnoredRemark[]>;

  /** Fonctions IA de ce poste : carte graphique, Ollama et ses modèles. Contacte Ollama. */
  etatIa(): Promise<AiState>;
  /** Enregistre les réglages IA du poste (revérifiés par le main). */
  enregistrerReglagesIa(reglages: AiSettings): Promise<AiState>;
  /** La consigne de la fonction suivie du texte de la page, à copier dans un autre outil. Ne contacte aucun modèle. */
  consigneIa(demande: AiRequest): Promise<AiPromptResult>;
  /** Taille, durée et coût estimés d'un appel, avant de le lancer. Ne contacte aucun modèle. */
  estimerIa(demande: AiRequest): Promise<AiEstimateResult>;
  /** Lance un appel et rend la proposition nettoyée. Rien n'est écrit dans la page. L'avancement arrive par surAvancementIa. */
  lancerIa(demande: AiRequest): Promise<AiRunResult>;
  annulerIa(): Promise<void>;
  surAvancementIa(ecouteur: (avancement: AiProgress) => void): () => void;
  /** Appels passés et leurs totaux par période (`.notes/ai-usage.json`). */
  historiqueIa(): Promise<AiUsageView>;
  surHistoriqueIa(ecouteur: () => void): () => void;

  /** Mémos vocaux en attente, page « Mémos vocaux », masquage, état de la transcription. Crée la page au premier mémo. */
  etatMemos(): Promise<MemosState>;
  /** Masque la page « Mémos vocaux » de l'arborescence sur ce poste, ou la réaffiche. */
  masquerMemos(demande: { masquer: boolean }): Promise<MemosState>;
  /** Octets d'un mémo (`.notes/memos/…`), pour l'écouter ou le convertir. null s'il n'existe plus. */
  lireMemo(demande: { chemin: string }): Promise<Uint8Array | null>;
  /** Transcrit un WAV 16 kHz mono (converti par la page). Lance le serveur s'il ne tourne pas. */
  transcrireMemo(demande: { wav: Uint8Array }): Promise<MemoTranscription>;
  /** Crée la sous-page du mémo avec le texte accepté, puis met l'audio à la corbeille. */
  accepterMemo(demande: { chemin: string; corps: string }): Promise<MemoAcceptance>;
  /** Met un mémo à la corbeille sans le transcrire. */
  ecarterMemo(demande: { chemin: string }): Promise<MemosState>;
  /** Décode par le ffmpeg de Notes un mémo que la page ne lit pas, en WAV 16 kHz mono. */
  convertirMemo(demande: { chemin: string }): Promise<MemoConversion>;
  /** Ouvre le dossier où arrivent les mémos (`.notes/memos/`) dans le gestionnaire de fichiers. */
  ouvrirDossierMemos(): Promise<{ ok: true } | { ok: false; message: string }>;
  /** Durées estimées de la transcription et de la mise en forme de ces mémos, dans l'ordre donné. */
  estimerMemos(demande: { chemins: string[] }): Promise<MemoEstimate>;
  /** Durée estimée de la mise en forme d'une transcription de cette longueur ; null si on ne peut pas l'estimer. */
  estimerMiseEnFormeMemo(demande: { caracteres: number }): Promise<number | null>;
  /** Télécharge le modèle de transcription (574 Mo). L'avancement arrive par surEtatWhisper. */
  installerModeleWhisper(): Promise<WhisperState>;
  annulerInstallationWhisper(): Promise<void>;
  surEtatWhisper(ecouteur: (etat: WhisperState) => void): () => void;
}
