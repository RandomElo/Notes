import type { Editor } from '@tiptap/core';

/** Position de la tâche dont la case est « caseACocher », ou null. Les `li` des tâches n'ont pas de `data-type` : on remonte le document. */
export function tacheDeLaCase(caseACocher: Element, editeur: Editor): number | null {
  const item = caseACocher.closest('li');
  if (item === null) {
    return null;
  }
  let position: number;
  try {
    position = editeur.view.posAtDOM(item, 0);
  } catch {
    return null;
  }
  const $position = editeur.state.doc.resolve(position);
  for (let profondeur = $position.depth; profondeur > 0; profondeur--) {
    if ($position.node(profondeur).type.name === 'taskItem') {
      return $position.before(profondeur);
    }
  }
  return null;
}
