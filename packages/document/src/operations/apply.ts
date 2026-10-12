import { Transform } from '@tiptap/pm/transform';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { lireMarkdown } from '../markdown/parse';
import { ecrireMarkdown } from '../markdown/serialize';
import { normaliserListe } from './todo-mode';

/**
 * Applique une opération ciblée au corps Markdown d'une page, sans éditeur
 * (le téléphone, docs/spec/android.md). Les blocs non touchés gardent leur texte
 * d'origine. En mode liste, la page est ensuite remise en règle comme le
 * fait l'éditeur du desktop. Rend le nouveau corps, ou null si rien n'a
 * changé.
 */
export function modifierCorps(corps: string, operation: (tr: Transform) => unknown, modeListe: boolean): string | null {
  const { document, source } = lireMarkdown(corps);
  const tr = new Transform(document);
  operation(tr);
  if (!tr.docChanged) {
    return null;
  }
  if (modeListe) {
    normaliserListe(tr);
  }
  const nouveau = ecrireMarkdown(tr.doc, source);
  return nouveau === corps ? null : nouveau;
}

/** Le document d'un corps, pour repérer les positions sur lesquelles préparer une opération. */
export function documentDuCorps(corps: string): ProseMirrorNode {
  return lireMarkdown(corps).document;
}
