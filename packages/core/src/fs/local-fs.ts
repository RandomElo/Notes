/**
 * Accès aux fichiers du vault local. Chaque application fournit sa propre
 * implémentation : node:fs côté desktop, stockage privé côté Android. Les
 * chemins sont relatifs à la racine du vault (voir paths.ts), le chemin vide
 * désigne la racine.
 */
export interface LocalFs {
  /** Métadonnées d'un fichier ou d'un dossier, null s'il n'existe pas. */
  infos(chemin: string): Promise<LocalEntry | null>;
  /** Contenu direct d'un dossier, sans descendre. Les liens symboliques sont ignorés. */
  lister(chemin: string): Promise<LocalEntry[]>;
  /** Lit un fichier UTF-8 tel quel, marque d'ordre d'octets et fins de ligne comprises. */
  lireTexte(chemin: string): Promise<string>;
  /** Crée ou remplace un fichier UTF-8, de façon atomique. Le dossier parent doit exister. */
  ecrireTexte(chemin: string, contenu: string): Promise<void>;
  /** Lit un fichier octet pour octet (sync, images). */
  lireOctets(chemin: string): Promise<Uint8Array>;
  /** Crée ou remplace un fichier, octet pour octet, de façon atomique. Le dossier parent doit exister. */
  ecrireOctets(chemin: string, contenu: Uint8Array): Promise<void>;
  /** Crée le dossier et ses parents manquants. Sans effet s'il existe. */
  creerDossier(chemin: string): Promise<void>;
  /** Renomme ou déplace. Échoue si la destination existe. */
  renommer(chemin: string, vers: string): Promise<void>;
  /** Copie un fichier, octet pour octet. Échoue si la destination existe. */
  copierFichier(chemin: string, vers: string): Promise<void>;
  /** Supprime un fichier, ou un dossier avec tout son contenu. */
  supprimer(chemin: string): Promise<void>;
}

export interface LocalEntry {
  nom: string;
  estDossier: boolean;
  /** Taille en octets, 0 pour un dossier. */
  taille: number;
  /** Date de dernière modification, en millisecondes depuis l'époque Unix. */
  modifieLe: number;
}

export type LocalFsErrorCode = 'introuvable' | 'existe_deja' | 'chemin_invalide' | 'interne';

export class LocalFsError extends Error {
  readonly code: LocalFsErrorCode;

  constructor(code: LocalFsErrorCode, message: string) {
    super(message);
    this.name = 'LocalFsError';
    this.code = code;
  }
}
