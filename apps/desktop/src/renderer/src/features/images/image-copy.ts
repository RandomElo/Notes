import { Extension } from '@tiptap/core';
import { Slice } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { api } from '../../lib/ipc';
import { readresserImages } from './image-url';

/** Type du presse-papiers qui dit de quelle page vient ce qui a été copié. */
const typeDeLaPage = 'application/x-notes-page';

export interface ImageCopyOptions {
  /** Chemin actuel de la page ouverte. */
  chemin: () => string;
  surErreur: (message: string) => void;
}

/**
 * Image copiée d'une page et collée dans une autre (README §6) : son adresse
 * est relative à sa page d'origine. Au collage, elle est réadressée vers
 * l'image d'origine pour s'afficher tout de suite, puis le fichier est copié
 * dans les `assets/` de la page et l'adresse devient locale.
 */
export const ImageCopy = Extension.create<ImageCopyOptions>({
  name: 'copieDImages',

  addOptions() {
    return { chemin: () => '', surErreur: () => undefined };
  },

  addProseMirrorPlugins() {
    const { editor } = this;
    const options = this.options;
    let sourceDuCollage: string | null = null;

    const rapatrier = async (fichiers: Map<string, string>): Promise<void> => {
      for (const [adresse, fichier] of fichiers) {
        const copie = await api.copierImage({ source: fichier, page: options.chemin() });
        if (!copie.ok || copie.adresses[0] === undefined) {
          // L'image reste affichée depuis sa page d'origine : rien n'est perdu.
          options.surErreur(`L'image n'a pas été copiée dans cette page : ${copie.ok ? 'aucune adresse rendue' : copie.erreur.message}`);
          continue;
        }
        if (editor.isDestroyed) {
          return;
        }
        const transaction = editor.state.tr;
        editor.state.doc.descendants((noeud, position) => {
          if (noeud.type.name === 'image' && noeud.attrs['src'] === adresse) {
            transaction.setNodeAttribute(position, 'src', copie.adresses[0]);
          }
        });
        if (transaction.docChanged) {
          editor.view.dispatch(transaction.setMeta('addToHistory', false));
        }
      }
    };

    return [
      new Plugin({
        key: new PluginKey('copieDImages'),
        view: (vue) => {
          // Après ProseMirror, qui vide puis remplit le presse-papiers : on y ajoute la page d'origine.
          const marquer = (evenement: ClipboardEvent): void => {
            if (evenement.target instanceof Node && vue.dom.contains(evenement.target)) {
              evenement.clipboardData?.setData(typeDeLaPage, options.chemin());
            }
          };
          window.addEventListener('copy', marquer);
          window.addEventListener('cut', marquer);
          return {
            destroy: () => {
              window.removeEventListener('copy', marquer);
              window.removeEventListener('cut', marquer);
            },
          };
        },
        props: {
          handleDOMEvents: {
            paste: (_vue, evenement) => {
              const source = evenement.clipboardData?.getData(typeDeLaPage) ?? '';
              sourceDuCollage = source === '' ? null : source;
              return false;
            },
          },
          transformPasted: (morceau) => {
            const source = sourceDuCollage;
            sourceDuCollage = null;
            const cible = options.chemin();
            if (source === null || source === cible) {
              return morceau;
            }
            const { contenu, fichiers } = readresserImages(morceau.content, source, cible);
            if (fichiers.size === 0) {
              return morceau;
            }
            void rapatrier(fichiers);
            return new Slice(contenu, morceau.openStart, morceau.openEnd);
          },
        },
      }),
    ];
  },
});
