import { deplacerBordure, largeursEgales } from '@notes/document';
import { Extension } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

/**
 * Largeur des colonnes d'un tableau, à la souris (docs/spec/editeur.md) : on
 * glisse la bordure entre deux colonnes. Pendant le geste, seules les `<col>`
 * de l'écran changent ; au relâchement, l'attribut `largeurs` du tableau est
 * écrit en une transaction (annulable), que la page enregistre dans son en-tête.
 */

/** Distance à la bordure, en pixels, où le pointeur la saisit. */
const prise = 5;

interface Bordure {
  tableau: HTMLTableElement;
  /** Position du nœud du tableau dans le document. */
  position: number;
  /** La bordure est à droite de cette colonne. */
  colonne: number;
}

/** La bordure entre deux colonnes sous le pointeur, ou null. Pas la bordure extérieure : le tableau prend toute la largeur. */
function bordureSous(vue: EditorView, evenement: MouseEvent): Bordure | null {
  const cible = evenement.target instanceof Element ? evenement.target : null;
  const cellule = cible?.closest<HTMLTableCellElement>('td, th') ?? null;
  const tableau = cellule?.closest('table') ?? null;
  if (cellule === null || tableau === null || !vue.dom.contains(tableau)) {
    return null;
  }
  const cadre = cellule.getBoundingClientRect();
  let colonne: number;
  if (cadre.right - evenement.clientX <= prise) {
    colonne = cellule.cellIndex;
  } else if (evenement.clientX - cadre.left <= prise) {
    colonne = cellule.cellIndex - 1;
  } else {
    return null;
  }
  const colonnes = tableau.rows[0]?.cells.length ?? 0;
  if (colonne < 0 || colonne >= colonnes - 1) {
    return null;
  }
  const $pos = vue.state.doc.resolve(vue.posAtDOM(cellule, 0));
  for (let profondeur = $pos.depth; profondeur > 0; profondeur--) {
    if ($pos.node(profondeur).type.name === 'table') {
      return { tableau, position: $pos.before(profondeur), colonne };
    }
  }
  return null;
}

function glisser(vue: EditorView, bordure: Bordure, depart: MouseEvent): void {
  const noeud: ProseMirrorNode | null = vue.state.doc.nodeAt(bordure.position);
  if (noeud === null) {
    return;
  }
  const nombre = noeud.firstChild?.childCount ?? 0;
  const actuelles = noeud.attrs['largeurs'] as number[] | null;
  const initiales = actuelles !== null && actuelles.length === nombre ? actuelles : largeursEgales(nombre);
  const largeurDuTableau = bordure.tableau.getBoundingClientRect().width;
  const cols = [...bordure.tableau.querySelectorAll<HTMLTableColElement>(':scope > colgroup > col')];
  let nouvelles = initiales;
  const bouger = (evenement: MouseEvent): void => {
    const ecart = Math.round(((evenement.clientX - depart.clientX) / largeurDuTableau) * 100);
    nouvelles = deplacerBordure(initiales, bordure.colonne, ecart);
    nouvelles.forEach((largeur, index) => {
      const col = cols[index];
      if (col !== undefined) {
        col.style.width = `${largeur}%`;
      }
    });
  };
  const lacher = (): void => {
    window.removeEventListener('mousemove', bouger);
    window.removeEventListener('mouseup', lacher);
    document.body.classList.remove('redimension-colonne');
    const courant = vue.state.doc.nodeAt(bordure.position);
    if (courant?.type.name === 'table' && nouvelles.some((largeur, index) => largeur !== initiales[index])) {
      vue.dispatch(vue.state.tr.setNodeMarkup(bordure.position, undefined, { ...courant.attrs, largeurs: nouvelles }));
    }
  };
  window.addEventListener('mousemove', bouger);
  window.addEventListener('mouseup', lacher);
}

export const ColumnResize = Extension.create({
  name: 'largeurDesColonnes',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('largeurDesColonnes'),
        props: {
          handleDOMEvents: {
            mousemove: (vue, evenement) => {
              // Le pointeur dit qu'on peut saisir la bordure.
              // Sur `body`, pas sur l'éditeur : ProseMirror surveille son élément et se resynchroniserait à chaque mouvement.
              document.body.classList.toggle('redimension-colonne', vue.editable && bordureSous(vue, evenement) !== null);
              return false;
            },
            mouseleave: () => {
              document.body.classList.remove('redimension-colonne');
              return false;
            },
            mousedown: (vue, evenement) => {
              if (!vue.editable || evenement.button !== 0) {
                return false;
              }
              const bordure = bordureSous(vue, evenement);
              if (bordure === null) {
                return false;
              }
              evenement.preventDefault();
              document.body.classList.add('redimension-colonne');
              glisser(vue, bordure, evenement);
              return true;
            },
          },
        },
      }),
    ];
  },
});
