import { Extension } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorState } from '@tiptap/pm/state';
import { dateEnToutesLettres } from './slash-commands';
import type { SlashAction } from './slash-commands';
import { declencheur } from './slash-trigger';
import type { SlashTrigger } from './slash-trigger';

export type SlashKey = 'haut' | 'bas' | 'valider' | 'fermer';

export interface SlashStorage {
  /** Posé par le menu affiché : reçoit les touches de navigation. Rend vrai s'il a traité la touche. */
  surTouche: ((touche: SlashKey) => boolean) | null;
}

/** Position du « / » pour lequel le menu a été fermé par Échap : il ne se rouvre pas tant qu'on tape à sa suite. */
const cle = new PluginKey<number | null>('menuSlash');

/** Le « / » en cours, s'il n'a pas été fermé par Échap. */
export function slashOuvert(etat: EditorState): SlashTrigger | null {
  const trouve = declencheur(etat);
  return trouve !== null && cle.getState(etat) !== trouve.de ? trouve : null;
}

/** Menu « / » : état d'ouverture et touches. L'affichage est dans SlashMenu.tsx. */
export const SlashKeys = Extension.create<Record<string, never>, SlashStorage>({
  name: 'slashMenu',
  // Avant la gestion des blocs : quand le menu est ouvert, les flèches, Entrée et Échap sont pour lui.
  priority: 1100,

  addStorage() {
    return { surTouche: null };
  },

  addKeyboardShortcuts() {
    const vers =
      (touche: SlashKey) =>
      ({ editor }: { editor: Editor }): boolean => {
        if (slashOuvert(editor.state) === null) {
          return false;
        }
        return (editor.storage as unknown as { slashMenu: SlashStorage }).slashMenu.surTouche?.(touche) ?? false;
      };
    return { ArrowUp: vers('haut'), ArrowDown: vers('bas'), Enter: vers('valider'), Tab: vers('valider'), Escape: vers('fermer') };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<number | null>({
        key: cle,
        state: {
          init: () => null,
          apply(transaction, ferme, _ancien, nouveau) {
            const demande = transaction.getMeta(cle) as number | undefined;
            if (demande !== undefined) {
              return demande;
            }
            // Le « / » fermé n'est plus celui du curseur : l'oubli permet au suivant de s'ouvrir.
            return ferme !== null && declencheur(nouveau)?.de === ferme ? ferme : null;
          },
        },
      }),
    ];
  },
});

/** Ferme le menu pour le « / » en cours, sans toucher au texte. */
export function fermerSlash(editor: Editor): void {
  const trouve = declencheur(editor.state);
  if (trouve !== null) {
    editor.view.dispatch(editor.state.tr.setMeta(cle, trouve.de));
  }
}

/**
 * Applique une commande : le « /recherche » est retiré, puis le bloc vide est
 * transformé sur place. S'il contient déjà du texte, la commande crée un
 * nouveau bloc en dessous, pour ne pas changer la nature de ce qui est écrit.
 */
export function appliquerCommande(editor: Editor, action: SlashAction, plage: SlashTrigger, surSousPage: () => void): void {
  editor.chain().focus().deleteRange({ from: plage.de, to: plage.a }).run();
  if (action.genre === 'date') {
    editor.chain().insertContent(dateEnToutesLettres(new Date())).run();
    return;
  }
  if (action.genre === 'sousPage') {
    surSousPage();
    return;
  }

  const bloc = editor.state.selection.$from;
  if (bloc.parent.content.size > 0) {
    const apres = bloc.after();
    editor.chain().insertContentAt(apres, { type: 'paragraph' }).setTextSelection(apres + 1).run();
  }
  const chaine = editor.chain();
  switch (action.genre) {
    case 'paragraphe':
      chaine.setParagraph();
      break;
    case 'titre':
      chaine.setHeading({ level: action.niveau });
      break;
    case 'liste':
      if (!editor.isActive(action.liste)) {
        chaine.toggleList(action.liste, action.liste === 'taskList' ? 'taskItem' : 'listItem');
      }
      break;
    case 'code':
      chaine.setCodeBlock();
      break;
  }
  chaine.run();
}
