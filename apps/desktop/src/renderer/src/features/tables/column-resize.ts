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
  // Écart en pourcentage de la largeur du tableau. Exact pendant le geste, pour que la bordure suive la souris
  // au pixel près ; arrondi au lâcher, le fichier gardant des pourcentages entiers.
  let ecart = 0;
  // Les deux largeurs en jeu, en pourcentage du tableau, montrées près du pointeur pendant le geste.
  const etiquette = document.createElement('div');
  etiquette.setAttribute('role', 'status');
  etiquette.className = 'bg-surface text-texte pointer-events-none fixed z-30 rounded px-2 py-0.5 text-xs whitespace-nowrap shadow-lg shadow-black/30';
  document.body.append(etiquette);
  const bouger = (evenement: MouseEvent): void => {
    ecart = ((evenement.clientX - depart.clientX) / largeurDuTableau) * 100;
    const largeurs = deplacerBordure(initiales, bordure.colonne, ecart);
    largeurs.forEach((largeur, index) => {
      const col = cols[index];
      if (col !== undefined) {
        col.style.width = `${largeur}%`;
      }
    });
    const [gauche, droite] = [largeurs[bordure.colonne] ?? 0, largeurs[bordure.colonne + 1] ?? 0];
    etiquette.textContent = `${Math.round(gauche)} % | ${Math.round(droite)} %`;
    etiquette.style.left = `${evenement.clientX + 14}px`;
    etiquette.style.top = `${evenement.clientY - 30}px`;
  };
  const lacher = (): void => {
    window.removeEventListener('mousemove', bouger);
    window.removeEventListener('mouseup', lacher);
    document.body.classList.remove('redimension-colonne');
    etiquette.remove();
    const nouvelles = deplacerBordure(initiales, bordure.colonne, Math.round(ecart));
    const courant = vue.state.doc.nodeAt(bordure.position);
    if (courant?.type.name === 'table' && nouvelles.some((largeur, index) => largeur !== initiales[index])) {
      vue.dispatch(vue.state.tr.setNodeMarkup(bordure.position, undefined, { ...courant.attrs, largeurs: nouvelles }));
    }
  };
  window.addEventListener('mousemove', bouger);
  window.addEventListener('mouseup', lacher);
}

/**
 * Largeurs d'un tableau dont le nombre de colonnes a changé : une colonne ajoutée prend une part égale et les autres
 * se serrent à proportion (le plus courant, une colonne à droite) ; en cas de retrait, les colonnes redeviennent égales.
 * Rend null pour des colonnes égales.
 */
export function largeursApresChangement(largeurs: readonly number[], colonnes: number): number[] | null {
  if (colonnes <= largeurs.length) {
    return null;
  }
  const ajoutees = colonnes - largeurs.length;
  const part = Math.max(5, Math.floor(100 / colonnes));
  const reste = 100 - part * ajoutees;
  const total = largeurs.reduce((somme, largeur) => somme + largeur, 0) || 100;
  const gardees = largeurs.map((largeur) => Math.max(5, Math.round((largeur * reste) / total)));
  const nouvelles = [...gardees, ...Array.from({ length: ajoutees }, () => part)];
  // Le total fait 100 : l'écart d'arrondi va à la plus large.
  const ecart = 100 - nouvelles.reduce((somme, largeur) => somme + largeur, 0);
  const plusLarge = nouvelles.indexOf(Math.max(...nouvelles));
  nouvelles[plusLarge] = (nouvelles[plusLarge] ?? 0) + ecart;
  return nouvelles;
}

export const ColumnResize = Extension.create({
  name: 'largeurDesColonnes',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('largeurDesColonnes'),
        // Une colonne ajoutée ou retirée : les largeurs réglées suivent le nombre de colonnes (sinon le `<colgroup>` resterait celui
        // d'avant, et la colonne de plus se retrouverait sans place).
        appendTransaction: (transactions, _avant, apres) => {
          if (!transactions.some((transaction) => transaction.docChanged)) {
            return null;
          }
          let transaction = apres.tr;
          apres.doc.descendants((noeud, position) => {
            if (noeud.type.name !== 'table') {
              return true;
            }
            const largeurs = noeud.attrs['largeurs'] as number[] | null;
            const colonnes = noeud.firstChild?.childCount ?? 0;
            if (largeurs !== null && largeurs.length !== colonnes) {
              transaction = transaction.setNodeMarkup(position, undefined, { ...noeud.attrs, largeurs: largeursApresChangement(largeurs, colonnes) });
            }
            return false;
          });
          return transaction.docChanged ? transaction : null;
        },
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
