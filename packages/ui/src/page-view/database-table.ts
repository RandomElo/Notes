import { estTableauDeBase } from '@notes/document';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { EditorView } from '@tiptap/pm/view';

const cleDuTableauCache = new PluginKey<boolean>('tableau-de-base-cache');

/** Classe du tableau écrit d'une base, caché dans l'éditeur (base.css). */
export const classeTableauDeBase = 'tableau-de-base-cache';

export interface DatabaseTableOptions {
  /** Caché dès l'ouverture : la page est une base. `definirTableauDeBaseCache` le change ensuite. */
  actif: boolean;
}

/**
 * Base de données dans un éditeur (docs/spec/base-de-donnees.md), au PC comme sur le téléphone : le tableau écrit
 * dans la page (l'état du moment des lignes, pour la lecture hors de l'application) est caché, la vue de la base
 * le remplace au-dessus du texte.
 */
export const TableauDeBaseCache = Extension.create<DatabaseTableOptions>({
  name: 'tableauDeBaseCache',
  addOptions() {
    return { actif: false };
  },
  addProseMirrorPlugins() {
    const { actif } = this.options;
    return [
      new Plugin<boolean>({
        key: cleDuTableauCache,
        state: {
          init: () => actif,
          apply: (tr, valeur) => (tr.getMeta(cleDuTableauCache) as boolean | undefined) ?? valeur,
        },
        props: {
          decorations(etat) {
            if (cleDuTableauCache.getState(etat) !== true) {
              return null;
            }
            const caches: Decoration[] = [];
            etat.doc.forEach((bloc, debut) => {
              if (estTableauDeBase(bloc)) {
                caches.push(Decoration.node(debut, debut + bloc.nodeSize, { class: classeTableauDeBase }));
              }
            });
            return DecorationSet.create(etat.doc, caches);
          },
        },
      }),
    ];
  },
});

/** Cache ou montre le tableau écrit de la base dans l'éditeur. Ne touche pas au document. */
export function definirTableauDeBaseCache(vue: EditorView, actif: boolean): void {
  vue.dispatch(vue.state.tr.setMeta(cleDuTableauCache, actif).setMeta('addToHistory', false));
}
