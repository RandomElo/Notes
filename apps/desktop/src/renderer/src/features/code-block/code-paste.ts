import { devinerLangage } from '@notes/ui';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

/**
 * Détection du langage au collage (docs/spec/editeur.md) : du code collé dans un bloc de
 * code vide et sans langage lui donne son langage, s'il se reconnaît
 * nettement. Ailleurs, le collage reste celui de l'éditeur.
 */
export const CodePaste = Extension.create({
  name: 'collageDeCode',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('collageDeCode'),
        props: {
          handlePaste(vue, evenement) {
            const { $from, empty } = vue.state.selection;
            const bloc = $from.parent;
            const texte = evenement.clipboardData?.getData('text/plain') ?? '';
            if (!empty || bloc.type.name !== 'codeBlock' || bloc.content.size > 0 || bloc.attrs['language'] !== null || texte === '') {
              return false;
            }
            const transaction = vue.state.tr.insertText(texte.replace(/\r\n?/g, '\n'));
            const langage = devinerLangage(texte);
            if (langage !== null) {
              transaction.setNodeMarkup($from.before(), null, { ...bloc.attrs, language: langage });
            }
            vue.dispatch(transaction.scrollIntoView());
            return true;
          },
        },
      }),
    ];
  },
});
