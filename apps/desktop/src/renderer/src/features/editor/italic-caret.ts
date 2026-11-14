import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import type { EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

const cle = new PluginKey('curseurItalique');

/** Vrai quand le prochain caractère tapé sera en italique : curseur seul, marque italique en cours. */
export function curseurEnItalique(etat: EditorState): boolean {
  const { selection } = etat;
  if (!(selection instanceof TextSelection) || !selection.empty) {
    return false;
  }
  return (etat.storedMarks ?? selection.$from.marks()).some((marque) => marque.type.name === 'italic');
}

function curseur(): HTMLElement {
  const element = document.createElement('span');
  element.className = 'curseur-italique';
  element.contentEditable = 'false';
  element.setAttribute('aria-hidden', 'true');
  return element;
}

/**
 * Curseur penché en italique (docs/spec/editeur.md) : le curseur du navigateur reste droit et
 * mord sur la lettre penchée. En italique, il est masqué et remplacé par un trait incliné
 * dessiné à sa place (styles.css). Rien ne change dans le document.
 */
export const CurseurItalique = Extension.create({
  name: 'curseurItalique',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: cle,
        props: {
          attributes: (etat): Record<string, string> => (curseurEnItalique(etat) ? { class: 'avec-curseur-italique' } : {}),
          decorations(etat) {
            if (!curseurEnItalique(etat)) {
              return null;
            }
            const position = etat.selection.from;
            // Clé changée à chaque position : le clignotement repart du début quand le curseur bouge, comme le vrai.
            return DecorationSet.create(etat.doc, [Decoration.widget(position, curseur, { side: -1, key: `curseur-italique-${position}`, ignoreSelection: true })]);
          },
        },
      }),
    ];
  },
});
