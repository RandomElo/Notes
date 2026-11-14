import { ressembleAMarkdown } from '@notes/document';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

/** Vrai pendant le collage « en texte » que l'utilisateur a choisi : ce collage-là ne repose pas la question. */
let collageEnTexte = false;

/** Colle le texte tel quel (sans la question), comme le ferait l'éditeur. */
export function collerEnTexte(vue: { pasteText(texte: string): boolean }, texte: string): void {
  collageEnTexte = true;
  try {
    vue.pasteText(texte);
  } finally {
    collageEnTexte = false;
  }
}

interface MarkdownPasteOptions {
  /** Du texte qui ressemble à du Markdown a été collé : rien n'est inséré avant la réponse. */
  surMarkdown: (texte: string, position: number) => void;
}

/**
 * Collage de texte Markdown (docs/spec/editeur.md) : du texte qui ressemble à du Markdown (titres, listes, code, tableau)
 * n'est pas inséré tout de suite. Une question propose de le mettre en forme dans la page, ou de le garder en texte.
 * Pas dans un bloc de code, pas pour un contenu copié depuis une page de Notes.
 */
export const MarkdownPaste = Extension.create<MarkdownPasteOptions>({
  name: 'collageMarkdown',

  addOptions() {
    return { surMarkdown: () => undefined };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    return [
      new Plugin({
        key: new PluginKey('collageMarkdown'),
        props: {
          handlePaste(vue, evenement) {
            const donnees = evenement.clipboardData;
            const texte = donnees?.getData('text/plain') ?? '';
            if (collageEnTexte || !vue.editable || texte === '' || vue.state.selection.$from.parent.type.spec.code === true) {
              return false;
            }
            // Une copie faite dans Notes garde sa mise en forme : elle se colle déjà comme il faut.
            if ((donnees?.getData('text/html') ?? '').includes('data-pm-slice')) {
              return false;
            }
            if (!ressembleAMarkdown(texte)) {
              return false;
            }
            options.surMarkdown(texte, vue.state.selection.from);
            return true;
          },
        },
      }),
    ];
  },
});
