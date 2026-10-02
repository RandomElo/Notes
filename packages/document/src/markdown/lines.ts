import type { FinDeLigne } from './types';

/** Les lignes d'un texte, repérées par leur position, sans rien copier. */
export interface Lines {
  /** Position du premier caractère de chaque ligne. */
  debuts: number[];
  /** Position de la fin de chaque ligne, avant sa fin de ligne. */
  fins: number[];
}

/**
 * Découpe en lignes comme le fait markdown-it (`\n`, `\r\n` ou `\r` seul), pour
 * que ses numéros de ligne désignent bien les nôtres.
 */
export function repererLignes(texte: string): Lines {
  const debuts = [0];
  const fins: number[] = [];
  for (const fin of texte.matchAll(/\r\n?|\n/g)) {
    fins.push(fin.index);
    debuts.push(fin.index + fin[0].length);
  }
  fins.push(texte.length);
  return { debuts, fins };
}

export function ligneEstVide(texte: string, lignes: Lines, numero: number): boolean {
  return /^[ \t]*$/.test(texte.slice(lignes.debuts[numero], lignes.fins[numero]));
}

/** Fin de ligne du fichier : celle de sa première ligne, `\n` à défaut. */
export function finDeLigneDe(texte: string): FinDeLigne {
  return /\r\n|\n/.exec(texte)?.[0] === '\r\n' ? '\r\n' : '\n';
}
