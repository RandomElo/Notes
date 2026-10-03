import { ecrireMarkdown, lireMarkdown, schema } from '@notes/document';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import type { Transaction } from '@tiptap/pm/state';
import { describe, expect, it } from 'vitest';
import { CellSelection } from '@tiptap/pm/tables';
import { agrandir, alignerColonne, celluleVoisine, deplacerRangee, entreeDansUneCellule, reduire, selectionnerRangee } from './table-commands';

const tableau = '| a | b |\n| - | - |\n| c | d |\n';

/** État avec le curseur à la fin du texte « texte ». */
function etatSur(markdown: string, texte: string): EditorState {
  const { document } = lireMarkdown(markdown);
  let position = -1;
  document.descendants((noeud, pos) => {
    if (noeud.isText && noeud.text === texte) {
      position = pos + texte.length;
    }
  });
  const etat = EditorState.create({ schema, doc: document });
  return etat.apply(etat.tr.setSelection(TextSelection.create(document, position)));
}

const texteDuCurseur = (etat: EditorState, transaction: Transaction | null): string => {
  expect(transaction).not.toBeNull();
  return etat.apply(transaction as Transaction).selection.$head.parent.textContent;
};

const markdown = (etat: EditorState, transaction: Transaction | null): string => ecrireMarkdown(etat.apply(transaction as Transaction).doc);

describe('déplacement entre cellules', () => {
  it('va dans les quatre directions', () => {
    const etat = etatSur(tableau, 'a');
    expect(texteDuCurseur(etat, celluleVoisine('bas')(etat))).toBe('c');
    expect(texteDuCurseur(etat, celluleVoisine('droite')(etat))).toBe('b');
    const d = etatSur(tableau, 'd');
    expect(texteDuCurseur(d, celluleVoisine('haut')(d))).toBe('b');
    expect(texteDuCurseur(d, celluleVoisine('gauche')(d))).toBe('c');
  });

  it('passe d’une ligne à l’autre par les bords', () => {
    const b = etatSur(tableau, 'b');
    expect(texteDuCurseur(b, celluleVoisine('droite')(b))).toBe('c');
  });

  it('ne sort pas du tableau', () => {
    const a = etatSur(tableau, 'a');
    expect(celluleVoisine('haut')(a)).toBeNull();
    expect(celluleVoisine('gauche')(a)).toBeNull();
    expect(celluleVoisine('bas')(etatSur('texte\n', 'texte'))).toBeNull();
  });
});

describe('Entrée dans une cellule', () => {
  it('descend, et ajoute une ligne sous la dernière', () => {
    const a = etatSur(tableau, 'a');
    expect(texteDuCurseur(a, entreeDansUneCellule(a))).toBe('c');
    const d = etatSur(tableau, 'd');
    const transaction = entreeDansUneCellule(d);
    expect(markdown(d, transaction)).toBe('| a   | b   |\n| --- | --- |\n| c   | d   |\n|     |     |\n');
    // Le curseur est dans la nouvelle ligne, sous « d ».
    const apres = d.apply(transaction as Transaction);
    expect(apres.selection.$head.index(-3)).toBe(2);
    expect(apres.selection.$head.index(-2)).toBe(1);
  });
});

describe('poignées', () => {
  const position = 0;

  it('ajoutent une colonne à droite et une ligne en bas', () => {
    const etat = etatSur(tableau, 'a');
    expect(markdown(etat, agrandir('colonne', position)(etat))).toBe('| a   | b   |     |\n| --- | --- | --- |\n| c   | d   |     |\n');
    expect(markdown(etat, agrandir('ligne', position)(etat))).toBe('| a   | b   |\n| --- | --- |\n| c   | d   |\n|     |     |\n');
  });

  it('ne retirent qu’une colonne ou une ligne vide', () => {
    const etat = etatSur(tableau, 'a');
    expect(reduire('colonne', position)(etat)).toBeNull();
    expect(reduire('ligne', position)(etat)).toBeNull();
    const vide = etatSur('| a |  |\n| - | - |\n| c |  |\n|  |  |\n', 'a');
    expect(markdown(vide, reduire('colonne', position)(vide))).toBe('| a   |\n| --- |\n| c   |\n|     |\n');
    expect(markdown(vide, reduire('ligne', position)(vide))).toBe('| a   |     |\n| --- | --- |\n| c   |     |\n');
  });

  it('gardent toujours l’en-tête et une colonne', () => {
    const seul = etatSur('| a |\n| - |\n', 'a');
    expect(reduire('ligne', position)(seul)).toBeNull();
    expect(reduire('colonne', position)(seul)).toBeNull();
  });
});

describe('alignement', () => {
  it('aligne toute la colonne du curseur', () => {
    const etat = etatSur(tableau, 'd');
    expect(markdown(etat, alignerColonne('right')(etat))).toBe('| a   |   b |\n| --- | --: |\n| c   |   d |\n');
  });
});

describe('lignes et colonnes entières', () => {
  const grand = '| a | b | c |\n| :- | :-: | -: |\n| d | e | f |\n| g | h | i |\n';

  it('sélectionnent toute une ligne ou toute une colonne', () => {
    const etat = etatSur(grand, 'a');
    const ligne = etat.apply(selectionnerRangee('ligne', 0, 1)(etat) as Transaction).selection;
    expect(ligne).toBeInstanceOf(CellSelection);
    expect((ligne as CellSelection).isRowSelection()).toBe(true);
    const textes: string[] = [];
    (ligne as CellSelection).forEachCell((noeud) => textes.push(noeud.textContent));
    expect(textes).toEqual(['d', 'e', 'f']);
    const colonne = etat.apply(selectionnerRangee('colonne', 0, 2)(etat) as Transaction).selection as CellSelection;
    expect(colonne.isColSelection()).toBe(true);
    expect(selectionnerRangee('ligne', 0, 3)(etat)).toBeNull();
  });

  it('déplacent une ligne, qui reste sélectionnée', () => {
    const etat = etatSur(grand, 'a');
    const transaction = deplacerRangee('ligne', 0, 2, 1)(etat);
    expect(markdown(etat, transaction)).toBe('| a   | b   |   c |\n| :-- | :-: | --: |\n| g   | h   |   i |\n| d   | e   |   f |\n');
    const selection = etat.apply(transaction as Transaction).selection as CellSelection;
    expect(selection.isRowSelection()).toBe(true);
    expect(selection.$anchorCell.nodeAfter?.textContent).toBe('g');
  });

  it('mettent une ligne en en-tête en la plaçant en premier, alignements gardés', () => {
    const etat = etatSur(grand, 'a');
    const transaction = deplacerRangee('ligne', 0, 2, 0)(etat);
    expect(markdown(etat, transaction)).toBe('| g   | h   |   i |\n| :-- | :-: | --: |\n| a   | b   |   c |\n| d   | e   |   f |\n');
    const apres = etat.apply(transaction as Transaction).doc.firstChild;
    expect(apres?.child(0).child(0).type.name).toBe('tableHeader');
    expect(apres?.child(1).child(0).type.name).toBe('tableCell');
  });

  it('déplacent une colonne avec son alignement', () => {
    const etat = etatSur(grand, 'a');
    expect(markdown(etat, deplacerRangee('colonne', 0, 2, 0)(etat))).toBe('|   c | a   | b   |\n| --: | :-- | :-: |\n|   f | d   | e   |\n|   i | g   | h   |\n');
  });

  it('ne font rien hors des bornes ou sur place', () => {
    const etat = etatSur(grand, 'a');
    expect(deplacerRangee('ligne', 0, 1, 1)(etat)).toBeNull();
    expect(deplacerRangee('ligne', 0, 1, 3)(etat)).toBeNull();
    expect(deplacerRangee('colonne', 5, 0, 1)(etat)).toBeNull();
  });
});
