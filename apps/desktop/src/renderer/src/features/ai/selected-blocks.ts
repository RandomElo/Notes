import type { EditorState } from '@tiptap/pm/state';

/** Une plage de blocs de premier niveau, positions du document. */
export interface BlockRange {
  from: number;
  to: number;
}

/**
 * Les blocs de premier niveau touchés par la sélection, en entier (docs/spec/ia.md) :
 * une fonction IA ne porte alors que sur eux. null sans sélection, ou si la
 * sélection couvre toute la page : la fonction porte sur la page entière.
 * Une sélection qui s'arrête au tout début d'un bloc (triple clic) ne le prend pas.
 */
export function blocsSelectionnes(etat: EditorState): BlockRange | null {
  const { selection, doc } = etat;
  if (selection.empty) {
    return null;
  }
  const debut = doc.resolve(selection.from);
  const fin = doc.resolve(selection.to);
  const from = debut.depth === 0 ? selection.from : debut.before(1);
  let to = fin.depth === 0 ? selection.to : fin.after(1);
  // Aucun caractère du dernier bloc n'est sélectionné : il n'en fait pas partie.
  if (fin.depth > 0 && fin.before(1) > from && doc.textBetween(fin.before(1), selection.to) === '') {
    to = fin.before(1);
  }
  if (to <= from || (from === 0 && to === doc.content.size)) {
    return null;
  }
  return { from, to };
}
