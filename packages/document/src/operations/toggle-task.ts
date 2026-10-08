import type { Transform } from '@tiptap/pm/transform';
import { rangerTaches } from './todo-mode';

/**
 * Coche ou décoche la tâche qui commence à « position ». En mode liste, elle
 * est ensuite rangée : cochée, en tête de « Terminé » ; décochée, après les
 * tâches à faire (README §14). Faux si ce n'est pas une tâche ou si elle est
 * déjà dans cet état.
 */
export function basculerTache(tr: Transform, position: number, coche: boolean, modeListe: boolean): boolean {
  const tache = tr.doc.nodeAt(position);
  if (tache === null || tache.type.name !== 'taskItem' || tache.attrs['checked'] === coche) {
    return false;
  }
  tr.setNodeMarkup(position, undefined, { ...tache.attrs, checked: coche });
  if (modeListe) {
    rangerTaches(tr);
  }
  return true;
}
