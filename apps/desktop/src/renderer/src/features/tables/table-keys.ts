import { Extension } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { celluleDuCurseur, celluleVoisine, entreeDansUneCellule } from './table-commands';

/** Au-delà de cette durée, `Ctrl+←/→` tenu passe d'une cellule à l'autre au lieu d'un mot à l'autre (docs/raccourcis.md). */
export const appuiLongMs = 350;

const dansUnTableau = (etat: EditorState): boolean => celluleDuCurseur(etat) !== null;

/**
 * Raccourcis des tableaux (docs/raccourcis.md, « Tableaux »). Tab et Maj+Tab
 * viennent de l'extension de TipTap. Ici : Entrée descend d'une cellule (et
 * ajoute une ligne sous la dernière), Ctrl+↑/↓ change de cellule, Ctrl+←/→
 * saute un mot en appui bref et une cellule en appui long.
 */
/** Un saut de ligne à la place de la sélection, dans la cellule. */
function sautDeLigne(etat: EditorState): Transaction | null {
  const saut = etat.schema.nodes['hardBreak'];
  return saut === undefined ? null : etat.tr.replaceSelectionWith(saut.create()).scrollIntoView();
}

export const TableKeys = Extension.create({
  name: 'toucheDesTableaux',
  // Avant la gestion des blocs et le texte : dans une cellule, ces touches sont pour le tableau.
  priority: 1050,

  addKeyboardShortcuts() {
    const jouer =
      (commande: (etat: EditorState) => Transaction | null) =>
      ({ editor }: { editor: Editor }): boolean => {
        if (!dansUnTableau(editor.state)) {
          return false;
        }
        const transaction = commande(editor.state);
        if (transaction !== null) {
          editor.view.dispatch(transaction);
        }
        return true;
      };
    return {
      Enter: jouer(entreeDansUneCellule),
      // Saut de ligne dans la cellule, écrit `<br>` dans le fichier (docs/spec/editeur.md).
      'Mod-Enter': jouer(sautDeLigne),
      'Shift-Enter': jouer(sautDeLigne),
      'Mod-ArrowUp': jouer(celluleVoisine('haut')),
      'Mod-ArrowDown': jouer(celluleVoisine('bas')),
    };
  },

  addProseMirrorPlugins() {
    // Touche Ctrl+← ou Ctrl+→ tenue en ce moment, le minuteur qui la fera passer à la cellule voisine, et la
    // position du curseur à l'appui : le saut de mot du navigateur a pu l'emmener dans la cellule d'à côté.
    let tenue: { touche: string; minuteur: number; depart: number | undefined } | null = null;
    const relacher = (): void => {
      if (tenue !== null) {
        window.clearTimeout(tenue.minuteur);
        tenue = null;
      }
    };
    const armer = (vue: EditorView, touche: string): number =>
      window.setTimeout(() => {
        if (tenue?.touche !== touche) {
          return;
        }
        const transaction = celluleVoisine(touche === 'ArrowLeft' ? 'gauche' : 'droite', tenue.depart)(vue.state);
        if (transaction !== null) {
          vue.dispatch(transaction);
        }
        tenue.depart = undefined;
        // Toujours tenue : une cellule de plus à chaque délai.
        tenue.minuteur = armer(vue, touche);
      }, appuiLongMs);

    return [
      new Plugin({
        key: new PluginKey('appuiLongDesTableaux'),
        props: {
          handleKeyDown(vue, evenement) {
            const horizontale = evenement.key === 'ArrowLeft' || evenement.key === 'ArrowRight';
            if (!horizontale || !evenement.ctrlKey || evenement.shiftKey || evenement.altKey || !dansUnTableau(vue.state)) {
              return false;
            }
            if (evenement.repeat || tenue?.touche === evenement.key) {
              // Tant que la touche est tenue, c'est le minuteur qui avance, pas la répétition du clavier.
              return true;
            }
            relacher();
            tenue = { touche: evenement.key, minuteur: armer(vue, evenement.key), depart: vue.state.selection.head };
            // Appui bref : le navigateur saute le mot, comme ailleurs.
            return false;
          },
          handleDOMEvents: {
            keyup(_vue, evenement) {
              if (evenement.key === tenue?.touche || evenement.key === 'Control') {
                relacher();
              }
              return false;
            },
            blur() {
              relacher();
              return false;
            },
          },
        },
        view: () => ({ destroy: relacher }),
      }),
    ];
  },
});
