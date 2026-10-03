import type { TableAlign } from '@notes/document';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import { CellSelection, TableMap, addColumn, addRow, cellAround, removeColumn, removeRow } from '@tiptap/pm/tables';

/**
 * Commandes des tableaux (README §6), pures : elles rendent la transaction à
 * appliquer, ou null si elles ne s'appliquent pas. Un tableau GFM n'a ni
 * cellules fusionnées ni largeurs : chaque cellule tient une case.
 */

/** Le tableau qui commence à « position ». */
interface TableauTrouve {
  noeud: ProseMirrorNode;
  /** Position juste avant le tableau. */
  position: number;
  map: TableMap;
}

function tableauEn(etat: EditorState, position: number): TableauTrouve | null {
  const noeud = etat.doc.nodeAt(position);
  return noeud?.type.name === 'table' ? { noeud, position, map: TableMap.get(noeud) } : null;
}

const rect = (tableau: TableauTrouve) => ({
  map: tableau.map,
  table: tableau.noeud,
  tableStart: tableau.position + 1,
  left: 0,
  top: 0,
  right: tableau.map.width,
  bottom: tableau.map.height,
});

/**
 * Position juste avant la cellule du curseur (ou de « position »), et le
 * tableau qui la contient. null hors d'un tableau.
 */
export function celluleDuCurseur(etat: EditorState, position?: number): { cellule: number; tableau: TableauTrouve } | null {
  const $cellule = cellAround(position === undefined ? etat.selection.$head : etat.doc.resolve(position));
  if ($cellule === null) {
    return null;
  }
  const tableau = tableauEn(etat, $cellule.before($cellule.depth - 1));
  return tableau === null ? null : { cellule: $cellule.pos, tableau };
}

/** Le curseur à la fin du texte de la cellule numéro « index » de la carte du tableau. */
function vers(transaction: Transaction, tableau: TableauTrouve, index: number): Transaction {
  const cellule = tableau.position + 1 + (tableau.map.map[index] as number);
  const noeud = transaction.doc.nodeAt(cellule);
  const fin = cellule + (noeud === null ? 1 : noeud.nodeSize - 2);
  return transaction.setSelection(TextSelection.near(transaction.doc.resolve(fin), -1)).scrollIntoView();
}

export type Direction = 'haut' | 'bas' | 'gauche' | 'droite';

/**
 * Passe à la cellule voisine de celle du curseur, ou de celle qui contient
 * « depuis ». À gauche et à droite, le bord d'une ligne mène à la ligne
 * d'à côté, comme Tab. null s'il n'y a pas de cellule dans ce sens.
 */
export function celluleVoisine(direction: Direction, depuis?: number) {
  return (etat: EditorState): Transaction | null => {
    const trouve = celluleDuCurseur(etat, depuis);
    if (trouve === null) {
      return null;
    }
    const { map } = trouve.tableau;
    const index = map.map.indexOf(trouve.cellule - trouve.tableau.position - 1);
    const pas = { haut: -map.width, bas: map.width, gauche: -1, droite: 1 }[direction];
    const cible = index + pas;
    if (index === -1 || cible < 0 || cible >= map.map.length) {
      return null;
    }
    return vers(etat.tr, trouve.tableau, cible);
  };
}

/**
 * Entrée dans une cellule : la cellule du dessous. Sur la dernière ligne, une
 * ligne est ajoutée et le curseur y descend, dans la même colonne.
 */
export function entreeDansUneCellule(etat: EditorState): Transaction | null {
  const descendre = celluleVoisine('bas')(etat);
  if (descendre !== null) {
    return descendre;
  }
  const trouve = celluleDuCurseur(etat);
  if (trouve === null) {
    return null;
  }
  const { tableau } = trouve;
  const colonne = tableau.map.map.indexOf(trouve.cellule - tableau.position - 1) % tableau.map.width;
  const transaction = addRow(etat.tr, rect(tableau), tableau.map.height);
  const agrandi = tableauEn(etat.apply(transaction), tableau.position) as TableauTrouve;
  return vers(transaction, agrandi, (agrandi.map.height - 1) * agrandi.map.width + colonne);
}

/** Ajoute une colonne à droite ou une ligne en bas du tableau qui commence à « position ». */
export function agrandir(sens: 'colonne' | 'ligne', position: number) {
  return (etat: EditorState): Transaction | null => {
    const tableau = tableauEn(etat, position);
    if (tableau === null) {
      return null;
    }
    return sens === 'colonne' ? addColumn(etat.tr, rect(tableau), tableau.map.width) : addRow(etat.tr, rect(tableau), tableau.map.height);
  };
}

const estVide = (noeud: ProseMirrorNode): boolean => noeud.textContent.trim() === '';

/**
 * Retire la dernière colonne ou la dernière ligne du tableau, si elle est vide.
 * Il reste toujours au moins une colonne et l'en-tête : on ne perd jamais de
 * texte en tirant une poignée.
 */
export function reduire(sens: 'colonne' | 'ligne', position: number) {
  return (etat: EditorState): Transaction | null => {
    const tableau = tableauEn(etat, position);
    if (tableau === null) {
      return null;
    }
    const { map, noeud } = tableau;
    if (sens === 'colonne') {
      const derniere = map.width - 1;
      if (derniere < 1 || !map.cellsInRect({ left: derniere, right: map.width, top: 0, bottom: map.height }).every((cellule) => estVide(noeud.nodeAt(cellule) as ProseMirrorNode))) {
        return null;
      }
      const transaction = etat.tr;
      removeColumn(transaction, rect(tableau), derniere);
      return transaction;
    }
    const derniere = map.height - 1;
    if (derniere < 1 || !estVide(noeud.child(derniere))) {
      return null;
    }
    const transaction = etat.tr;
    removeRow(transaction, rect(tableau), derniere);
    return transaction;
  };
}

/** Aligne la colonne du curseur. L'alignement est celui de l'en-tête, que toutes les cellules de la colonne suivent. */
export function alignerColonne(align: TableAlign | null) {
  return (etat: EditorState): Transaction | null => {
    const trouve = celluleDuCurseur(etat);
    if (trouve === null) {
      return null;
    }
    const { map, position } = trouve.tableau;
    const colonne = map.map.indexOf(trouve.cellule - position - 1) % map.width;
    const transaction = etat.tr;
    for (let ligne = 0; ligne < map.height; ligne++) {
      const cellule = position + 1 + (map.map[ligne * map.width + colonne] as number);
      const noeud = etat.doc.nodeAt(cellule);
      if (noeud !== null) {
        transaction.setNodeMarkup(cellule, null, { ...noeud.attrs, align });
      }
    }
    return transaction;
  };
}

/** Alignement de la colonne du curseur, null hors d'un tableau ou sans alignement. */
export function alignementCourant(etat: EditorState): TableAlign | null {
  const trouve = celluleDuCurseur(etat);
  if (trouve === null) {
    return null;
  }
  const align: unknown = etat.doc.nodeAt(trouve.cellule)?.attrs['align'];
  return align === 'left' || align === 'center' || align === 'right' ? align : null;
}

/** Sélection de toute une ligne ou toute une colonne du tableau qui commence à « position » dans « doc ». */
function selectionDeRangee(doc: ProseMirrorNode, position: number, sens: 'ligne' | 'colonne', index: number): CellSelection | null {
  const noeud = doc.nodeAt(position);
  if (noeud?.type.name !== 'table') {
    return null;
  }
  const map = TableMap.get(noeud);
  if (index < 0 || index >= (sens === 'ligne' ? map.height : map.width)) {
    return null;
  }
  const cellule = (ligne: number, colonne: number) => doc.resolve(position + 1 + (map.map[ligne * map.width + colonne] as number));
  return sens === 'ligne'
    ? new CellSelection(cellule(index, 0), cellule(index, map.width - 1))
    : new CellSelection(cellule(0, index), cellule(map.height - 1, index));
}

/** Sélectionne toute une ligne ou toute une colonne du tableau qui commence à « position ». */
export function selectionnerRangee(sens: 'ligne' | 'colonne', position: number, index: number) {
  return (etat: EditorState): Transaction | null => {
    const selection = selectionDeRangee(etat.doc, position, sens, index);
    return selection === null ? null : etat.tr.setSelection(selection);
  };
}

/** Déplace une valeur d'un tableau JavaScript de « de » à « vers ». */
function deplacer<T>(valeurs: readonly T[], de: number, vers: number): T[] {
  const copie = [...valeurs];
  const [pris] = copie.splice(de, 1);
  copie.splice(vers, 0, pris as T);
  return copie;
}

/**
 * Déplace la ligne ou la colonne « de » à la place « vers » (rang qu'elle aura
 * après le déplacement), puis la sélectionne. Une ligne qui arrive en première
 * place devient l'en-tête : GFM n'a d'en-tête que la première ligne.
 * L'alignement reste celui de chaque colonne.
 */
export function deplacerRangee(sens: 'ligne' | 'colonne', position: number, de: number, vers: number) {
  return (etat: EditorState): Transaction | null => {
    const tableau = tableauEn(etat, position);
    const taille = tableau === null ? 0 : sens === 'ligne' ? tableau.map.height : tableau.map.width;
    const { tableHeader: entete, tableCell: cellule } = etat.schema.nodes;
    if (tableau === null || entete === undefined || cellule === undefined || de === vers || Math.min(de, vers) < 0 || Math.max(de, vers) >= taille) {
      return null;
    }
    const premiere = tableau.noeud.firstChild as ProseMirrorNode;
    let aligns = Array.from({ length: premiere.childCount }, (_, colonne) => premiere.child(colonne).attrs['align'] as unknown);
    let lignes: ProseMirrorNode[][] = [];
    tableau.noeud.forEach((ligne) => {
      const cases: ProseMirrorNode[] = [];
      ligne.forEach((case_) => cases.push(case_));
      lignes.push(cases);
    });
    // Les alignements sont ceux des colonnes : ils suivent une colonne déplacée, pas une ligne.
    if (sens === 'ligne') {
      lignes = deplacer(lignes, de, vers);
    } else {
      lignes = lignes.map((cases) => deplacer(cases, de, vers));
      aligns = deplacer(aligns, de, vers);
    }
    const typeDeLigne = premiere.type;
    const nouvelles = lignes.map((cases, index) =>
      typeDeLigne.create(
        null,
        cases.map((case_, colonne) => (index === 0 ? entete : cellule).create({ ...case_.attrs, align: aligns[colonne] ?? null }, case_.content, case_.marks)),
      ),
    );
    const transaction = etat.tr.replaceWith(position + 1, position + tableau.noeud.nodeSize - 1, nouvelles);
    const selection = selectionDeRangee(transaction.doc, position, sens, vers);
    return selection === null ? transaction : transaction.setSelection(selection);
  };
}
