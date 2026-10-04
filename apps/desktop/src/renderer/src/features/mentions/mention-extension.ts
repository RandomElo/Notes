import { Extension } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorState } from '@tiptap/pm/state';
import { declencheurDeMention } from './mention-trigger';
import type { MentionTrigger } from './mention-trigger';

export type MentionKey = 'haut' | 'bas' | 'valider' | 'fermer';

export interface MentionStorage {
  /** Posé par la liste affichée : reçoit les touches de navigation. Rend vrai s'il a traité la touche. */
  surTouche: ((touche: MentionKey) => boolean) | null;
}

/** Position du « @ » pour lequel la liste a été fermée par Échap : elle ne se rouvre pas tant qu'on tape à sa suite. */
const cle = new PluginKey<number | null>('mention');

/** Le « @ » en cours, s'il n'a pas été fermé par Échap. */
export function mentionOuverte(etat: EditorState): MentionTrigger | null {
  const trouve = declencheurDeMention(etat);
  return trouve !== null && cle.getState(etat) !== trouve.de ? trouve : null;
}

/** Choix d'une page au « @ » : état d'ouverture et touches. L'affichage est dans MentionMenu.tsx. */
export const MentionKeys = Extension.create<Record<string, never>, MentionStorage>({
  name: 'mentionMenu',
  // Comme le menu « / » : avant la gestion des blocs, les flèches, Entrée et Échap sont pour la liste ouverte.
  priority: 1100,

  addStorage() {
    return { surTouche: null };
  },

  addKeyboardShortcuts() {
    const vers =
      (touche: MentionKey) =>
      ({ editor }: { editor: Editor }): boolean => {
        if (mentionOuverte(editor.state) === null) {
          return false;
        }
        return (editor.storage as unknown as { mentionMenu: MentionStorage }).mentionMenu.surTouche?.(touche) ?? false;
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
            return ferme !== null && declencheurDeMention(nouveau)?.de === ferme ? ferme : null;
          },
        },
      }),
    ];
  },
});

/** Ferme la liste pour le « @ » en cours, sans toucher au texte. */
export function fermerMention(editor: Editor): void {
  const trouve = declencheurDeMention(editor.state);
  if (trouve !== null) {
    editor.view.dispatch(editor.state.tr.setMeta(cle, trouve.de));
  }
}

/** Remplace « @recherche » par la mention de la page, suivie d'une espace pour continuer à écrire. */
export function insererMention(editor: Editor, plage: { de: number; a: number }, page: { id: string; titre: string }): void {
  editor
    .chain()
    .focus()
    .insertContentAt({ from: plage.de, to: plage.a }, [
      { type: 'pageMention', attrs: { id: page.id, libelle: page.titre, title: null } },
      { type: 'text', text: ' ' },
    ])
    .run();
}
