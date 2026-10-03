import { Extension } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorState } from '@tiptap/pm/state';
import { estItem } from './block-ranges';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { allerAuBloc, deplacerBlocs, dupliquerBlocs, editerBloc, etendreSelection, indenterBlocs, selectionnerBloc, supprimerBlocs } from './block-commands';
import type { BlockCommand } from './block-commands';
import { BlockSelection } from './block-selection';

/** Classe posée sur chaque bloc sélectionné : l'état se montre par le fond (voir styles.css). */
export const classeBlocSelectionne = 'bloc-selectionne';

const blocsSelectionnes = (etat: EditorState): boolean => etat.selection instanceof BlockSelection;
const tabPourLeBloc = (editor: Editor): boolean => editor.isActive('table') || editor.isActive('codeBlock');

/**
 * Gestion des blocs au clavier (README §6) : Échap sélectionne le bloc (puis
 * sa liste, puis rend le curseur). Sans Ctrl, les flèches agissent sur la
 * sélection (flèches : naviguer, Maj+flèches : étendre). Ctrl+Maj+flèches
 * déplace les blocs. Ctrl+D duplique, Tab et Maj+Tab indentent, Entrée
 * rend le curseur.
 */
export const BlockKeys = Extension.create({
  name: 'blockKeys',
  // Avant les raccourcis des listes et du texte : une sélection de blocs change le sens des flèches, de Tab et d'Entrée.
  priority: 1000,

  addKeyboardShortcuts() {
    const jouer = (editor: Editor, commande: BlockCommand): boolean => {
      const transaction = commande(editor.state);
      if (transaction !== null) {
        editor.view.dispatch(transaction);
      }
      return transaction !== null;
    };
    // Sur une sélection de blocs, la touche est toujours consommée : elle ne doit pas agir sur un curseur invisible.
    const surBlocs =
      (commande: BlockCommand) =>
      ({ editor }: { editor: Editor }): boolean => {
        if (!blocsSelectionnes(editor.state)) {
          return false;
        }
        jouer(editor, commande);
        return true;
      };
    const partout =
      (commande: BlockCommand) =>
      ({ editor }: { editor: Editor }): boolean =>
        jouer(editor, commande) || blocsSelectionnes(editor.state);

    return {
      Escape: ({ editor }) => {
        jouer(editor, selectionnerBloc);
        return true;
      },
      ArrowUp: surBlocs(allerAuBloc(-1)),
      ArrowDown: surBlocs(allerAuBloc(1)),
      ArrowLeft: surBlocs(allerAuBloc(-1)),
      ArrowRight: surBlocs(allerAuBloc(1)),
      'Shift-ArrowUp': surBlocs(etendreSelection(-1)),
      'Shift-ArrowDown': surBlocs(etendreSelection(1)),
      // Avec Ctrl+Maj, ce sont les blocs qui bougent : les blocs sélectionnés, ou celui du curseur.
      'Mod-Shift-ArrowUp': partout(deplacerBlocs(-1)),
      'Mod-Shift-ArrowDown': partout(deplacerBlocs(1)),
      'Mod-d': ({ editor }) => {
        jouer(editor, dupliquerBlocs);
        // Toujours consommé : sinon Chromium propose d'ajouter un favori.
        return true;
      },
      Enter: surBlocs(editerBloc),
      Backspace: surBlocs(supprimerBlocs),
      Delete: surBlocs(supprimerBlocs),
      Tab: ({ editor }) => {
        if (blocsSelectionnes(editor.state)) {
          jouer(editor, indenterBlocs(1));
          return true;
        }
        // Dans un tableau, Tab change de cellule ; dans un bloc de code, il indente : leurs extensions s'en chargent.
        if (tabPourLeBloc(editor)) {
          return false;
        }
        // Dans une liste, Tab imbrique l'item. Ailleurs il ne fait rien, mais ne doit pas faire sortir de l'éditeur.
        if (!editor.commands.sinkListItem('listItem')) {
          editor.commands.sinkListItem('taskItem');
        }
        return true;
      },
      'Shift-Tab': ({ editor }) => {
        if (blocsSelectionnes(editor.state)) {
          jouer(editor, indenterBlocs(-1));
          return true;
        }
        if (tabPourLeBloc(editor)) {
          return false;
        }
        if (!editor.commands.liftListItem('listItem')) {
          editor.commands.liftListItem('taskItem');
        }
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('blocsSelectionnes'),
        props: {
          decorations(etat) {
            const { selection } = etat;
            if (!(selection instanceof BlockSelection)) {
              return null;
            }
            const decorations: Decoration[] = [];
            etat.doc.nodesBetween(selection.from, selection.to, (noeud, position) => {
              if (position >= selection.from && position + noeud.nodeSize <= selection.to) {
                // Un item : seule sa ligne est mise en évidence, pas ses sous-items (qui le suivent quand il bouge).
                const ligne = estItem(noeud) ? noeud.firstChild : null;
                const debut = ligne === null ? position : position + 1;
                decorations.push(Decoration.node(debut, debut + (ligne ?? noeud).nodeSize, { class: classeBlocSelectionne }));
                return false;
              }
              return true;
            });
            return DecorationSet.create(etat.doc, decorations);
          },
          // Une frappe ne remplace pas des blocs entiers : il faut Entrée pour écrire, Suppr pour supprimer.
          handleTextInput(vue) {
            return vue.state.selection instanceof BlockSelection;
          },
        },
      }),
    ];
  },
});
