import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { chercherDansLaPage } from './find-model';
import type { FoundRange } from './find-model';

/** La recherche en cours dans la page (`Ctrl+F`) : ce qu'on cherche, ce qui est trouvé, le passage en cours. */
export interface FindState {
  requete: string;
  trouves: FoundRange[];
  /** Rang du passage en cours dans `trouves`, -1 s'il n'y en a pas. */
  courant: number;
}

export const cleDeLaRecherche = new PluginKey<FindState>('recherche');

const vide: FindState = { requete: '', trouves: [], courant: -1 };

/** Le passage le plus proche à partir de « position », en boucle. */
function rangDepuis(trouves: FoundRange[], position: number): number {
  if (trouves.length === 0) {
    return -1;
  }
  const rang = trouves.findIndex((trouve) => trouve.from >= position);
  return rang === -1 ? 0 : rang;
}

/**
 * Recherche dans la page (docs/spec/editeur.md) : les passages trouvés sont surlignés, celui en
 * cours plus fort. Rien ne change dans le document. La barre (`FindBar`) pilote la recherche par
 * des méta de transaction : `{ requete }` pour chercher, `{ courant }` pour passer d'un passage à l'autre.
 */
export const PageFind = Extension.create({
  name: 'rechercheDansLaPage',
  addProseMirrorPlugins() {
    return [
      new Plugin<FindState>({
        key: cleDeLaRecherche,
        state: {
          init: () => vide,
          apply: (tr, ancien) => {
            const demande = tr.getMeta(cleDeLaRecherche) as Partial<Pick<FindState, 'requete' | 'courant'>> | undefined;
            const requete = demande?.requete ?? ancien.requete;
            if (requete === '') {
              return vide;
            }
            if (demande?.requete !== undefined || tr.docChanged) {
              // Recherche refaite : on reste sur le passage en cours, ou on va au premier après le curseur.
              const trouves = chercherDansLaPage(tr.doc, requete);
              const depuis = ancien.courant >= 0 && demande?.requete === undefined ? tr.mapping.map(ancien.trouves[ancien.courant]!.from) : tr.selection.from;
              return { requete, trouves, courant: rangDepuis(trouves, depuis) };
            }
            if (demande?.courant !== undefined && ancien.trouves.length > 0) {
              const nombre = ancien.trouves.length;
              return { ...ancien, courant: ((demande.courant % nombre) + nombre) % nombre };
            }
            return ancien;
          },
        },
        props: {
          decorations(etat: EditorState) {
            const { trouves, courant } = cleDeLaRecherche.getState(etat) ?? vide;
            if (trouves.length === 0) {
              return null;
            }
            return DecorationSet.create(
              etat.doc,
              trouves.map((trouve, rang) => Decoration.inline(trouve.from, trouve.to, { class: rang === courant ? 'recherche-courant' : 'recherche-trouve' })),
            );
          },
        },
      }),
    ];
  },
});
