import { zipSync } from 'fflate';
import type { Zippable } from 'fflate';

/** Un fichier de l'archive : chemin relatif (« Projets/Projets.md ») et contenu. */
export interface ArchiveEntry {
  chemin: string;
  octets: Uint8Array;
}

/** Vrai pour un chemin qui reste dans l'archive : relatif, sans « .. », sans morceau vide ni barre oblique inverse. */
export function estCheminDArchive(chemin: string): boolean {
  if (chemin.length === 0 || chemin.length > 1024 || chemin.startsWith('/') || chemin.includes('\\') || [...chemin].some((caractere) => caractere.charCodeAt(0) < 0x20)) {
    return false;
  }
  return chemin.split('/').every((morceau) => morceau !== '' && morceau !== '.' && morceau !== '..');
}

/** Les images, déjà compressées, sont rangées telles quelles ; le texte est compressé. */
const dejaCompresse = /\.(webp|png|jpe?g|gif|avif)$/i;

/**
 * L'archive ZIP d'un export (README §9). Refuse un chemin qui sortirait de
 * l'archive à l'extraction ou un fichier en double.
 */
export function creerArchive(entrees: ArchiveEntry[]): Uint8Array {
  const arbre: Zippable = {};
  const vus = new Set<string>();
  for (const { chemin, octets } of entrees) {
    if (!estCheminDArchive(chemin) || vus.has(chemin)) {
      throw new Error(`Chemin refusé dans l'archive : ${chemin}`);
    }
    vus.add(chemin);
    arbre[chemin] = [octets, { level: dejaCompresse.test(chemin) ? 0 : 6 }];
  }
  return zipSync(arbre);
}
