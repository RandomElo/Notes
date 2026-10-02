import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

export type FinDeLigne = '\n' | '\r\n';

/** Un bloc de premier niveau tel qu'il était dans le fichier. */
export interface SourceBlock {
  /** Le bloc une fois lu. Sert à reconnaître, à l'écriture, un bloc qui n'a pas changé. */
  noeud: ProseMirrorNode;
  /** Son texte dans le fichier, sans la fin de sa dernière ligne. */
  texte: string;
  /** Ce qui le sépare du bloc suivant, ou de la fin du fichier pour le dernier. */
  separateur: string;
}

/**
 * Le texte d'origine d'une page, découpé par bloc. Remis bout à bout
 * (prefixe, puis texte et separateur de chaque bloc), il redonne le fichier à
 * l'octet près : c'est ce qui garantit l'aller-retour sans perte.
 */
export interface PageSource {
  finDeLigne: FinDeLigne;
  /** Ce qui précède le premier bloc. Tout le corps s'il n'y a aucun bloc. */
  prefixe: string;
  blocs: SourceBlock[];
}

export interface ParsedMarkdown {
  document: ProseMirrorNode;
  source: PageSource;
}
