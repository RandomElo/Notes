import { remplacerTableauDeBase } from '@notes/document';
import type { EditorView } from '@tiptap/pm/view';

/**
 * Met à jour le tableau écrit de la base dans l'éditeur (docs/spec/base-de-donnees.md), s'il a changé : la page
 * s'enregistre comme après une frappe. Hors de l'historique : annuler ne doit pas ramener un tableau qui ne dit
 * plus vrai. Le tableau lui-même est caché dans l'éditeur par `TableauDeBaseCache` (@notes/ui).
 */
export function mettreAJourLeTableau(vue: EditorView, markdown: string): void {
  const tr = vue.state.tr;
  if (remplacerTableauDeBase(tr, markdown)) {
    vue.dispatch(tr.setMeta('addToHistory', false));
  }
}
