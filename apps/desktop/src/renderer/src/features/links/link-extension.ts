import { estAdresseWeb, idDeLienInterne } from '@notes/document';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { lienDImage } from '../images/image-link';
import { lienA, poserLien } from './link-commands';

export interface LinkOptions {
  /** Ouvre une page du dossier des notes. « nouvelOnglet » : Ctrl+clic ou clic du milieu. */
  ouvrirPage: (id: string, nouvelOnglet: boolean) => void;
  /** Titre de la page, null si elle n'existe pas : un lien collé vers une page inconnue reste du texte. */
  titreDePage: (id: string) => string | null;
  /** Une adresse web vient d'être collée seule : elle devient une mention de site si le site répond. */
  surAdresseCollee?: (adresse: string) => void;
}

export interface LinkStorage {
  /** Posé par l'infobulle des liens : ouvre le formulaire sur la sélection (bouton « Lien » de la barre d'outils). */
  ouvrirFormulaire: (() => void) | null;
}

/** Ouvre l'adresse d'un lien : une page dans l'application, le reste dans le navigateur (le main ne laisse passer que http, https et mailto). */
export function ouvrirAdresse(adresse: string, nouvelOnglet: boolean, options: LinkOptions): void {
  const id = idDeLienInterne(adresse);
  if (id !== null) {
    options.ouvrirPage(id, nouvelOnglet);
  } else if (estAdresseWeb(adresse)) {
    window.open(adresse, '_blank', 'noopener');
  }
}

/** Le lien sous un clic : celui du texte, pas une mention (elle s'ouvre par sa propre vue). */
function lienSousLeClic(vue: EditorView, evenement: MouseEvent): string | null {
  const cible = evenement.target instanceof Element ? evenement.target.closest('a[href]') : null;
  if (cible === null || !vue.dom.contains(cible) || cible.closest('.mention') !== null) {
    return null;
  }
  const position = vue.posAtCoords({ left: evenement.clientX, top: evenement.clientY });
  return position === null ? null : (lienA(vue.state, position.pos)?.adresse ?? null);
}

/**
 * Liens dans l'éditeur (README §6) : un clic ouvre le lien, une adresse
 * collée sur une sélection en fait un lien, une adresse collée seule devient
 * un lien au texte nettoyé (`google.com`), un lien vers une page connue une
 * mention. Pour modifier un lien : les flèches, ou « Modifier » dans son infobulle.
 */
export const LinkBehaviour = Extension.create<LinkOptions, LinkStorage>({
  name: 'liens',

  addOptions() {
    return { ouvrirPage: () => undefined, titreDePage: () => null };
  },

  addStorage() {
    return { ouvrirFormulaire: null };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    return [
      new Plugin({
        key: new PluginKey('liens'),
        props: {
          handleDOMEvents: {
            // Au clic : rien d'autre ne doit se passer (le navigateur suivrait le lien dans la fenêtre).
            click: (vue, evenement) => {
              const adresse = lienSousLeClic(vue, evenement);
              if (adresse === null || evenement.button !== 0) {
                return false;
              }
              evenement.preventDefault();
              ouvrirAdresse(adresse, evenement.ctrlKey || evenement.metaKey, options);
              return true;
            },
            auxclick: (vue, evenement) => {
              const adresse = lienSousLeClic(vue, evenement);
              if (adresse === null || evenement.button !== 1) {
                return false;
              }
              evenement.preventDefault();
              ouvrirAdresse(adresse, true, options);
              return true;
            },
          },
          handlePaste: (vue, evenement) => {
            const texte = evenement.clipboardData?.getData('text/plain').trim() ?? '';
            const { selection } = vue.state;
            const $debut = selection.$from;
            const dansDuCode = $debut.parent.type.spec.code === true || $debut.marks().some((marque) => marque.type.name === 'code');
            // Un lien d'image se traite à part (proposition de téléchargement).
            if (texte === '' || dansDuCode || lienDImage(texte) !== null) {
              return false;
            }
            const id = idDeLienInterne(texte);
            const titre = id === null ? null : options.titreDePage(id);
            if (id !== null && titre === null) {
              return false;
            }
            if (id === null && !estAdresseWeb(texte)) {
              return false;
            }
            const plage = { de: selection.from, a: selection.to };
            const texteChoisi = titre ?? (selection.empty ? '' : vue.state.doc.textBetween(plage.de, plage.a, ' '));
            // Une sélection sur plusieurs blocs ne devient pas un lien : on colle l'adresse comme du texte.
            if (!selection.empty && !$debut.sameParent(selection.$to)) {
              return false;
            }
            vue.dispatch(poserLien(vue.state, plage, texteChoisi, texte).scrollIntoView());
            if (id === null && selection.empty) {
              options.surAdresseCollee?.(texte);
            }
            return true;
          },
        },
      }),
    ];
  },
});
