import { Extension, mergeAttributes } from '@tiptap/core';
import { Table as Tableau, TableCell as Cellule, TableHeader as CelluleDEntete, TableRow as Ligne } from '@tiptap/extension-table';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin } from '@tiptap/pm/state';

/**
 * Tableaux GFM (docs/spec/editeur.md) : mise en page seulement. Une cellule contient un
 * seul paragraphe ; ses sauts de ligne s'écrivent `<br>` dans le fichier.
 * La première ligne est toujours l'en-tête, comme dans le fichier.
 * L'alignement est celui de la colonne : chaque cellule le porte, et la ligne
 * de séparation du fichier l'écrit (`:--`, `:-:`, `--:`).
 */

export const alignements = ['left', 'center', 'right'] as const;
export type TableAlign = (typeof alignements)[number];

/**
 * Le tableau prend toute la largeur, colonnes fixes : elles ne bougent pas
 * pendant la frappe. `largeurs` (pourcentages, une par colonne) vient de
 * l'en-tête de la page (`table_widths`), pas du Markdown ; sans elles, les
 * colonnes sont égales. Rendu sans vue maison (`View: null`) : le même
 * `<colgroup>` partout, éditeur, téléphone et export.
 */
export const Table = Tableau.extend({
  addAttributes() {
    return { ...this.parent?.(), largeurs: { default: null, rendered: false } };
  },
  renderHTML({ node, HTMLAttributes }) {
    const largeurs = node.attrs['largeurs'] as number[] | null;
    const colonnes = node.firstChild?.childCount ?? 0;
    const valables = largeurs !== null && largeurs.length === colonnes;
    const cols = Array.from({ length: colonnes }, (_, index) => ['col', valables ? { style: `width: ${largeurs[index]}%` } : {}]);
    // L'enveloppe `tableWrapper` est celle de TipTap : défilement, sélection du bloc et poignées s'y accrochent.
    return ['div', { class: 'tableWrapper' }, ['table', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), ['colgroup', ...cols], ['tbody', 0]]];
  },
}).configure({ resizable: false, allowTableNodeSelection: false, View: null });

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
