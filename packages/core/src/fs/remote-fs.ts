/**
 * Accès aux fichiers du NAS. Chaque application fournit sa propre
 * implémentation : binaire compagnon côté desktop, plugin Capacitor côté
 * Android. Les chemins sont relatifs à la racine du partage (voir paths.ts).
 */
export interface RemoteFs {
  /** Métadonnées d'un fichier ou d'un dossier, null s'il n'existe pas. */
  infos(chemin: string): Promise<RemoteEntry | null>;
  /** Contenu d'un dossier. Le chemin vide désigne la racine du partage. */
  lister(chemin: string): Promise<RemoteEntry[]>;
  lire(chemin: string): Promise<Uint8Array>;
  /** Crée le fichier ou remplace son contenu. */
  ecrire(chemin: string, contenu: Uint8Array): Promise<void>;
  /** Crée le dossier et ses parents manquants. Sans effet s'il existe. */
  creerDossier(chemin: string): Promise<void>;
  renommer(chemin: string, vers: string): Promise<void>;
  /** Supprime un fichier ou un dossier vide. */
  supprimer(chemin: string): Promise<void>;
}

export interface RemoteEntry {
  nom: string;
  estDossier: boolean;
  /** Taille en octets, 0 pour un dossier. */
  taille: number;
  /** Date de dernière modification, en millisecondes depuis l'époque Unix. */
  modifieLe: number;
}

/** Codes d'erreur communs à toutes les implémentations de RemoteFs. */
export type RemoteFsErrorCode =
  | 'injoignable'
  | 'identifiants_refuses'
  | 'partage_introuvable'
  | 'chiffrement_absent'
  | 'introuvable'
  | 'existe_deja'
  | 'dossier_non_vide'
  | 'acces_refuse'
  | 'non_connecte'
  | 'requete_invalide'
  | 'interne';

const codesConnus: ReadonlySet<string> = new Set<RemoteFsErrorCode>([
  'injoignable',
  'identifiants_refuses',
  'partage_introuvable',
  'chiffrement_absent',
  'introuvable',
  'existe_deja',
  'dossier_non_vide',
  'acces_refuse',
  'non_connecte',
  'requete_invalide',
  'interne',
]);

/** Ramène un code reçu de l'extérieur à un code connu. */
export function versCodeErreur(code: unknown): RemoteFsErrorCode {
  return typeof code === 'string' && codesConnus.has(code) ? (code as RemoteFsErrorCode) : 'interne';
}

export class RemoteFsError extends Error {
  readonly code: RemoteFsErrorCode;

  constructor(code: RemoteFsErrorCode, message: string) {
    super(message);
    this.name = 'RemoteFsError';
    this.code = code;
  }
}
