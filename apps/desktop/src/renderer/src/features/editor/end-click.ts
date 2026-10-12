import type { EditorState, Transaction } from '@tiptap/pm/state';
import { TextSelection } from '@tiptap/pm/state';

/**
 * Clic dans la zone vide sous le dernier bloc (docs/spec/editeur.md) : le curseur va dans
 * un paragraphe vide à la fin de la page, créé s'il le faut. Un paragraphe vide
 * n'a pas d'écriture en Markdown : le fichier ne change pas tant qu'on n'y tape rien.
 */
export function allerALaFin(etat: EditorState): Transaction {
  const { doc, tr } = etat;
  const dernier = doc.lastChild;
  if (dernier?.type.name === 'paragraph' && dernier.content.size === 0) {
    return tr.setSelection(TextSelection.create(doc, doc.content.size - 1)).scrollIntoView();
  }
  const paragraphe = etat.schema.nodes['paragraph']!.create();
  const insere = tr.insert(doc.content.size, paragraphe);
  return insere.setSelection(TextSelection.create(insere.doc, insere.doc.content.size - 1)).scrollIntoView();
}
