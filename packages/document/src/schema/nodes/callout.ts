import { Node } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';

/** Natures de callout, chacune avec sa couleur du thème (`[callout]`) et son icône par défaut. */
export const typesDeCallout = ['info', 'success', 'warning', 'danger'] as const;
export type CalloutType = (typeof typesDeCallout)[number];

export const iconesParDefaut: Record<CalloutType, string> = { info: '💡', success: '✅', warning: '⚠️', danger: '🛑' };

/** Nature d'un callout, « info » quand le fichier n'en dit rien. */
export function typeDuCallout(type: unknown): CalloutType {
  return (typesDeCallout as readonly unknown[]).includes(type) ? (type as CalloutType) : 'info';
}

/** Icône affichée : celle du fichier, ou celle de la nature du callout. */
export function iconeDuCallout(attributs: { type: unknown; icon: unknown }): string {
  return typeof attributs.icon === 'string' && attributs.icon !== '' ? attributs.icon : iconesParDefaut[typeDuCallout(attributs.type)];
}

/**
 * Callout (README §4) : un encadré coloré avec une icône, qui contient des
 * paragraphes mis en forme. Écrit dans le fichier comme un bloc fencé
 * `notes-callout` en YAML (voir markdown/callout.ts). « type » et « icon »
 * restent null quand le fichier ne les donne pas, pour être réécrits pareil.
 */
export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'paragraph+',
  defining: true,

  addAttributes() {
    return {
      type: { default: null, rendered: false },
      icon: { default: null, rendered: false },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-callout]',
        contentElement: '.callout-contenu',
        getAttrs: (element) => ({
          type: (typesDeCallout as readonly (string | null)[]).includes(element.getAttribute('data-type')) ? element.getAttribute('data-type') : null,
          icon: element.getAttribute('data-icon'),
        }),
      },
    ];
  },

  // L'icône vient du fichier : elle est posée comme texte, jamais comme HTML.
  renderHTML({ node }) {
    const attributs: Record<string, string> = { 'data-callout': '', 'data-type': typeDuCallout(node.attrs['type']) };
    if (typeof node.attrs['icon'] === 'string') {
      attributs['data-icon'] = node.attrs['icon'];
    }
    return [
      'div',
      attributs,
      ['span', { class: 'callout-icone', contenteditable: 'false', 'aria-hidden': 'true' }, iconeDuCallout(node.attrs as { type: unknown; icon: unknown })],
      ['div', { class: 'callout-contenu' }, 0],
    ];
  },

  addKeyboardShortcuts() {
    return {
      // Entrée sur le dernier paragraphe, vide, d'un callout : on en sort, comme d'une liste.
      Enter: ({ editor }) => {
        const { $from, empty } = editor.state.selection;
        if (!empty || $from.depth < 2 || $from.node(-1).type.name !== this.name) {
          return false;
        }
        const callout = $from.node(-1);
        if ($from.parent.content.size > 0 || $from.index(-1) !== callout.childCount - 1 || callout.childCount === 1) {
          return false;
        }
        const paragraphe = editor.schema.nodes['paragraph'];
        if (paragraphe === undefined) {
          return false;
        }
        const transaction = editor.state.tr;
        const debutDuParagraphe = $from.before();
        transaction.delete(debutDuParagraphe, $from.after());
        const apres = transaction.mapping.map($from.after(-1));
        transaction.insert(apres, paragraphe.create());
        transaction.setSelection(TextSelection.create(transaction.doc, apres + 1));
        editor.view.dispatch(transaction.scrollIntoView());
        return true;
      },
      // Retour arrière au début d'un callout : son texte redevient des paragraphes ordinaires.
      Backspace: ({ editor }) => {
        const { $from, empty } = editor.state.selection;
        if (!empty || $from.parentOffset !== 0 || $from.depth < 2 || $from.node(-1).type.name !== this.name || $from.index(-1) !== 0) {
          return false;
        }
        return editor.commands.lift('paragraph');
      },
    };
  },
});
