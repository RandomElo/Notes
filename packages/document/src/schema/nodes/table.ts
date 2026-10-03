import { Extension } from '@tiptap/core';
import { Table as Tableau, TableCell as Cellule, TableHeader as CelluleDEntete, TableRow as Ligne } from '@tiptap/extension-table';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin } from '@tiptap/pm/state';

/**
 * Tableaux GFM (README §6) : mise en page seulement. Une cellule contient un
 * seul paragraphe, sans saut de ligne (Markdown n'en a pas dans un tableau).
 * La première ligne est toujours l'en-tête, comme dans le fichier.
 * L'alignement est celui de la colonne : chaque cellule le porte, et la ligne
 * de séparation du fichier l'écrit (`:--`, `:-:`, `--:`).
 */

export const alignements = ['left', 'center', 'right'] as const;
export type TableAlign = (typeof alignements)[number];

export const Table = Tableau.configure({ resizable: false, allowTableNodeSelection: false });

export const TableRow = Ligne;

export const TableHeader = CelluleDEntete.extend({ content: 'paragraph' });

export const TableCell = Cellule.extend({ content: 'paragraph' });

/**
 * Garde la première ligne de chaque tableau en en-tête, et seulement elle,
 * après une ligne supprimée, déplacée ou ajoutée au-dessus. Chaque cellule
 * prend l'alignement de sa colonne, celui de l'en-tête : une ligne ajoutée
 * s'aligne comme les autres.
 */
export const TableHeaderRow = Extension.create({
  name: 'enTeteDeTableau',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (transactions, _ancien, etat) => {
          if (!transactions.some((transaction) => transaction.docChanged)) {
            return null;
          }
          const { tableHeader: entete, tableCell: cellule } = etat.schema.nodes;
          if (entete === undefined || cellule === undefined) {
            return null;
          }
          const transaction = etat.tr;
          etat.doc.descendants((noeud, position) => {
            if (noeud.type.name !== 'table') {
              return true;
            }
            let ligne = position + 1;
            const premiere = noeud.firstChild;
            noeud.forEach((rangee: ProseMirrorNode, _decalage, index) => {
              let case_ = ligne + 1;
              rangee.forEach((celluleCourante, _position, colonne) => {
                const voulu = index === 0 ? entete : cellule;
                const align: unknown = premiere !== null && colonne < premiere.childCount ? premiere.child(colonne).attrs['align'] : null;
                if (celluleCourante.type !== voulu || celluleCourante.attrs['align'] !== align) {
                  transaction.setNodeMarkup(case_, voulu, { ...celluleCourante.attrs, align });
                }
                case_ += celluleCourante.nodeSize;
              });
              ligne += rangee.nodeSize;
            });
            return false;
          });
          return transaction.docChanged ? transaction : null;
        },
      }),
    ];
  },
});
