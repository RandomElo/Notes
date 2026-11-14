import { decouperFences } from '../ai/reserved-blocks';

/**
 * Un texte collé qui ressemble à du Markdown (docs/spec/editeur.md) : un titre (`## …`), un bloc de code, un tableau, ou au
 * moins deux lignes d'une liste, d'une citation ou d'une tâche, hors des blocs de code. Une phrase seule, ou un
 * seul `-` en début de ligne, ne compte pas : le collage reste alors un collage de texte.
 */
export function ressembleAMarkdown(texte: string): boolean {
  const morceaux = decouperFences(texte.replace(/\r\n?/g, '\n'));
  if (morceaux.some((morceau) => morceau.fence)) {
    return true;
  }
  let signes = 0;
  for (const ligne of morceaux.flatMap((morceau) => morceau.lignes)) {
    if (/^#{1,6}\s+\S/.test(ligne) || /^\|.+\|\s*$/.test(ligne) || /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(ligne)) {
      return true;
    }
    if (/^\s*([-*+]|\d+[.)])\s+\S/.test(ligne) || /^>\s?\S/.test(ligne) || /^\s*[-*+]\s+\[[ xX]\]\s/.test(ligne)) {
      signes += 1;
    }
  }
  return signes >= 2;
}
