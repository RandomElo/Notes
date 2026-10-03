import type { Editor } from '@tiptap/react';
import { ArrowLeftToLine, ArrowRightToLine, ArrowDownToLine, ArrowUpToLine, GripHorizontal, GripVertical, Heading, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { ContextMenu } from '../sidebar/ContextMenu';
import type { MenuItem } from '../sidebar/ContextMenu';
import { deplacerRangee, selectionnerRangee } from './table-commands';

/** Distance minimale pour qu'un appui sur une poignée soit un glissement plutôt qu'un clic. */
const seuilDeGlissement = 4;

type Sens = 'ligne' | 'colonne';

/** La cellule survolée : son tableau (position dans le document), sa ligne et sa colonne. */
interface Cible {
  position: number;
  ligne: number;
  colonne: number;
}

interface Glissement {
  sens: Sens;
  de: number;
  departX: number;
  departY: number;
  bouge: boolean;
  /** Rang où la rangée tomberait, compté dans le tableau d'avant (0 à taille). */
  rang: number;
}

/** Position du tableau dont l'élément est « table », null s'il n'est pas dans l'éditeur. */
function positionDuTableau(editor: Editor, table: HTMLTableElement): number | null {
  let trouve: number | null = null;
  editor.state.doc.descendants((noeud, position) => {
    if (trouve !== null) {
      return false;
    }
    if (noeud.type.name === 'table') {
      const dom = editor.view.nodeDOM(position);
      if (dom === table || (dom instanceof HTMLElement && dom.querySelector('table') === table)) {
        trouve = position;
      }
      return false;
    }
    return !noeud.isTextblock;
  });
  return trouve;
}

function tableDe(editor: Editor, position: number): HTMLTableElement | null {
  const dom = editor.view.nodeDOM(position);
  if (!(dom instanceof HTMLElement)) {
    return null;
  }
  return dom instanceof HTMLTableElement ? dom : dom.querySelector('table');
}

/** Rang d'insertion (0 à n) d'après la position du pointeur et les milieux des rangées. */
function rangSous(milieux: number[], pointeur: number): number {
  return milieux.filter((milieu) => milieu < pointeur).length;
}

/**
 * Poignées de ligne et de colonne d'un tableau (README §6), comme dans Notion :
 * au survol d'une cellule, une poignée à gauche de sa ligne et une au-dessus de
 * sa colonne. Un clic sélectionne toute la ligne ou la colonne et ouvre son
 * menu (mettre en en-tête, insérer, supprimer) ; un glissement la déplace.
 */
export function RowColumnGrips({ editor }: { editor: Editor }) {
  const [cible, definirCible] = useState<Cible | null>(null);
  const [menu, definirMenu] = useState<{ sens: Sens; x: number; y: number } | null>(null);
  const [glisse, definirGlisse] = useState<Glissement | null>(null);
  const glissement = useRef<Glissement | null>(null);
  const oubli = useRef(0);
  const [, rafraichir] = useState(0);

  useEffect(() => {
    const surMouvement = (evenement: MouseEvent): void => {
      if (glissement.current !== null || menu !== null) {
        return;
      }
      const element = evenement.target instanceof Element ? evenement.target : null;
      if (element?.closest('[data-poignee-rangee]') != null) {
        window.clearTimeout(oubli.current);
        return;
      }
      const cellule = element?.closest('td, th');
      const table = cellule?.closest('table');
      if (editor.isEditable && cellule instanceof HTMLTableCellElement && table instanceof HTMLTableElement && editor.view.dom.contains(table)) {
        const position = positionDuTableau(editor, table);
        const ligne = (cellule.parentElement as HTMLTableRowElement | null)?.rowIndex ?? -1;
        if (position !== null && ligne >= 0) {
          window.clearTimeout(oubli.current);
          const nouvelle = { position, ligne, colonne: cellule.cellIndex };
          definirCible((actuelle) =>
            actuelle?.position === nouvelle.position && actuelle.ligne === nouvelle.ligne && actuelle.colonne === nouvelle.colonne ? actuelle : nouvelle,
          );
          return;
        }
      }
      // Le temps d'atteindre une poignée, posée sur le bord du tableau.
      window.clearTimeout(oubli.current);
      oubli.current = window.setTimeout(() => definirCible(null), 400);
    };
    const suivre = (): void => rafraichir((compteur) => compteur + 1);
    document.addEventListener('mousemove', surMouvement);
    editor.on('transaction', suivre);
    window.addEventListener('scroll', suivre, true);
    return () => {
      window.clearTimeout(oubli.current);
      document.removeEventListener('mousemove', surMouvement);
      editor.off('transaction', suivre);
      window.removeEventListener('scroll', suivre, true);
    };
  }, [editor, menu]);

  if (editor.isDestroyed || !editor.isEditable || cible === null) {
    return null;
  }
  const table = tableDe(editor, cible.position);
  const rangees = table === null ? [] : [...table.rows];
  const rangee = rangees[cible.ligne];
  const cellule = rangee?.cells[cible.colonne];
  if (table === null || rangee === undefined || cellule === undefined) {
    return null;
  }
  const cadre = table.getBoundingClientRect();
  const cadreLigne = rangee.getBoundingClientRect();
  const cadreCellule = cellule.getBoundingClientRect();

  const jouer = (commande: ReturnType<typeof selectionnerRangee>): boolean => {
    const transaction = commande(editor.state);
    if (transaction === null) {
      return false;
    }
    editor.view.dispatch(transaction);
    return true;
  };

  /** Milieux des lignes (en y) ou des colonnes (en x), pour trouver où la rangée tomberait. */
  const milieux = (sens: Sens): number[] =>
    sens === 'ligne'
      ? rangees.map((tr) => {
          const boite = tr.getBoundingClientRect();
          return boite.top + boite.height / 2;
        })
      : [...(rangees[0]?.cells ?? [])].map((td) => {
          const boite = td.getBoundingClientRect();
          return boite.left + boite.width / 2;
        });

  const commencer = (sens: Sens) => (evenement: ReactPointerEvent<HTMLButtonElement>) => {
    evenement.preventDefault();
    evenement.currentTarget.setPointerCapture(evenement.pointerId);
    const de = sens === 'ligne' ? cible.ligne : cible.colonne;
    glissement.current = { sens, de, departX: evenement.clientX, departY: evenement.clientY, bouge: false, rang: de };
  };

  const suivre = (evenement: ReactPointerEvent<HTMLButtonElement>): void => {
    const geste = glissement.current;
    if (geste === null) {
      return;
    }
    if (!geste.bouge && Math.hypot(evenement.clientX - geste.departX, evenement.clientY - geste.departY) < seuilDeGlissement) {
      return;
    }
    geste.bouge = true;
    geste.rang = rangSous(milieux(geste.sens), geste.sens === 'ligne' ? evenement.clientY : evenement.clientX);
    definirGlisse({ ...geste });
  };

  const finir = (evenement: ReactPointerEvent<HTMLButtonElement>): void => {
    const geste = glissement.current;
    glissement.current = null;
    definirGlisse(null);
    if (geste === null) {
      return;
    }
    const { position } = cible;
    if (!geste.bouge) {
      // Un clic : la rangée est sélectionnée et son menu s'ouvre sous la poignée.
      if (jouer(selectionnerRangee(geste.sens, position, geste.de))) {
        const boite = evenement.currentTarget.getBoundingClientRect();
        definirMenu({ sens: geste.sens, x: boite.left, y: boite.bottom + 2 });
      }
      return;
    }
    // Le rang compte la rangée déplacée : au-delà de sa place, la cible recule d'un cran une fois celle-ci retirée.
    const vers = geste.rang > geste.de ? geste.rang - 1 : geste.rang;
    if (vers !== geste.de) {
      jouer(deplacerRangee(geste.sens, position, geste.de, vers));
      definirCible(geste.sens === 'ligne' ? { ...cible, ligne: vers } : { ...cible, colonne: vers });
    }
    editor.view.focus();
  };

  const elementsDuMenu = (sens: Sens): MenuItem[] => {
    const chaine = () => editor.chain().focus();
    if (sens === 'ligne') {
      return [
        ...(cible.ligne > 0
          ? [{ libelle: 'Mettre en en-tête', icone: Heading, action: () => void jouer(deplacerRangee('ligne', cible.position, cible.ligne, 0)) }]
          : []),
        { libelle: 'Insérer au-dessus', icone: ArrowUpToLine, action: () => void chaine().addRowBefore().run() },
        { libelle: 'Insérer en dessous', icone: ArrowDownToLine, action: () => void chaine().addRowAfter().run() },
        { libelle: 'Supprimer la ligne', icone: Trash2, action: () => void chaine().deleteRow().run() },
      ];
    }
    return [
      { libelle: 'Insérer à gauche', icone: ArrowLeftToLine, action: () => void chaine().addColumnBefore().run() },
      { libelle: 'Insérer à droite', icone: ArrowRightToLine, action: () => void chaine().addColumnAfter().run() },
      { libelle: 'Supprimer la colonne', icone: Trash2, action: () => void chaine().deleteColumn().run() },
    ];
  };

  const poignee = 'bg-surface hover:bg-accent/30 active:bg-accent/40 text-discret fixed z-20 flex items-center justify-center rounded touch-none shadow-sm shadow-black/40';
  const sansFocus = (evenement: { preventDefault(): void }): void => evenement.preventDefault();

  // Repère du dépôt pendant un glissement : un trait entre deux lignes ou deux colonnes.
  let repere: { gauche: number; haut: number; largeur: number; hauteur: number } | null = null;
  if (glisse?.bouge === true) {
    if (glisse.sens === 'ligne') {
      const avant = rangees[glisse.rang]?.getBoundingClientRect();
      const y = avant === undefined ? cadre.bottom : avant.top;
      repere = { gauche: cadre.left, haut: y - 1, largeur: cadre.width, hauteur: 2 };
    } else {
      const cases = [...(rangees[0]?.cells ?? [])];
      const avant = cases[glisse.rang]?.getBoundingClientRect();
      const x = avant === undefined ? cadre.right : avant.left;
      repere = { gauche: x - 1, haut: cadre.top, largeur: 2, hauteur: cadre.height };
    }
  }

  return (
    <>
      <button
        type="button"
        data-poignee-rangee
        aria-label="Ligne : déplacer ou ouvrir son menu"
        title="Glisser pour déplacer la ligne, cliquer pour la sélectionner et ouvrir son menu"
        onMouseDown={sansFocus}
        onPointerDown={commencer('ligne')}
        onPointerMove={suivre}
        onPointerUp={finir}
        onPointerCancel={() => {
          glissement.current = null;
          definirGlisse(null);
        }}
        // Sur le bord gauche, un peu vers l'intérieur : la poignée du bloc tableau tient dans la marge, juste à côté.
        style={{ left: cadre.left - 3, top: cadreLigne.top + cadreLigne.height / 2 - 12, width: 12, height: 24 }}
        className={`${poignee} cursor-grab`}
      >
        <GripVertical className="size-3" aria-hidden="true" />
      </button>
      <button
        type="button"
        data-poignee-rangee
        aria-label="Colonne : déplacer ou ouvrir son menu"
        title="Glisser pour déplacer la colonne, cliquer pour la sélectionner et ouvrir son menu"
        onMouseDown={sansFocus}
        onPointerDown={commencer('colonne')}
        onPointerMove={suivre}
        onPointerUp={finir}
        onPointerCancel={() => {
          glissement.current = null;
          definirGlisse(null);
        }}
        style={{ left: cadreCellule.left + cadreCellule.width / 2 - 12, top: cadre.top - 8, width: 24, height: 16 }}
        className={`${poignee} cursor-grab`}
      >
        <GripHorizontal className="size-3.5" aria-hidden="true" />
      </button>
      {repere !== null && (
        <span
          aria-hidden="true"
          className="bg-accent pointer-events-none fixed z-30"
          style={{ left: repere.gauche, top: repere.haut, width: repere.largeur, height: repere.hauteur }}
        />
      )}
      {menu !== null && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          elements={elementsDuMenu(menu.sens)}
          surFermeture={() => {
            definirMenu(null);
            editor.view.focus();
          }}
        />
      )}
    </>
  );
}
