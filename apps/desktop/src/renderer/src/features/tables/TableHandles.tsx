import type { Editor } from '@tiptap/react';
import { Plus } from 'lucide-react';
import { useEffect, useReducer, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { agrandir, reduire } from './table-commands';

/** Distance minimale pour qu'un appui sur une poignée soit un glissement plutôt qu'un clic. */
const seuilDeGlissement = 4;

/** Le tableau qui commence à « position » et son élément à l'écran. */
function elementDuTableau(editor: Editor, position: number): HTMLTableElement | null {
  const dom = editor.view.nodeDOM(position);
  if (!(dom instanceof HTMLElement)) {
    return null;
  }
  return dom instanceof HTMLTableElement ? dom : dom.querySelector('table');
}

/** Épaisseur des poignées « + ». */
const epaisseur = 16;
/** Écart entre le tableau et sa poignée. */
const ecartDuBord = 3;
/** Distance au bord, à l'intérieur du tableau, où la souris fait déjà apparaître la poignée. */
const approche = 10;

type Bord = 'droit' | 'bas';

/** Le bord droit ou bas d'un tableau près du point (x, y), avec la position du tableau. */
function bordSous(editor: Editor, x: number, y: number): { position: number; bord: Bord } | null {
  let trouve: { position: number; bord: Bord } | null = null;
  editor.state.doc.descendants((noeud, position) => {
    if (trouve !== null) {
      return false;
    }
    if (noeud.type.name !== 'table') {
      return !noeud.isTextblock;
    }
    const table = elementDuTableau(editor, position);
    if (table !== null) {
      const cadre = table.getBoundingClientRect();
      const dehors = ecartDuBord + epaisseur + 4;
      if (y >= cadre.top && y <= cadre.bottom && x >= cadre.right - approche && x <= cadre.right + dehors) {
        trouve = { position, bord: 'droit' };
      } else if (x >= cadre.left && x <= cadre.right && y >= cadre.bottom - approche && y <= cadre.bottom + dehors) {
        trouve = { position, bord: 'bas' };
      }
    }
    return false;
  });
  return trouve;
}

interface Glissement {
  sens: 'colonne' | 'ligne';
  position: number;
  depart: number;
  /** Largeur d'une colonne ou hauteur d'une ligne au départ : un pas de glissement. */
  pas: number;
  /** Colonnes ou lignes ajoutées (négatif : retirées) depuis le départ. */
  fait: number;
  bouge: boolean;
}

/**
 * Poignées des bords droit et bas d'un tableau (README §6) : tirées, elles
 * ajoutent des colonnes ou des lignes, et en retirent en revenant, pendant le
 * geste. Seule une colonne ou une ligne vide est retirée. Un simple clic en
 * ajoute une. Chacune n'apparaît que quand la souris s'approche de son bord.
 */
export function TableHandles({ editor }: { editor: Editor }) {
  const [, rafraichir] = useReducer((compteur: number) => compteur + 1, 0);
  const [survole, definirSurvole] = useState<{ position: number; bord: Bord } | null>(null);
  const glissement = useRef<Glissement | null>(null);
  const [glisse, definirGlisse] = useState<{ position: number; bord: Bord } | null>(null);

  useEffect(() => {
    const surMouvement = (evenement: MouseEvent): void => {
      if (glissement.current !== null) {
        return;
      }
      // Sur la poignée elle-même, elle reste.
      if (evenement.target instanceof Element && evenement.target.closest('[data-poignee-tableau]') !== null) {
        return;
      }
      const trouve = editor.isEditable ? bordSous(editor, evenement.clientX, evenement.clientY) : null;
      definirSurvole((actuel) => (actuel?.position === trouve?.position && actuel?.bord === trouve?.bord ? actuel : trouve));
    };
    document.addEventListener('mousemove', surMouvement);
    editor.on('transaction', rafraichir);
    window.addEventListener('scroll', rafraichir, true);
    window.addEventListener('resize', rafraichir);
    return () => {
      document.removeEventListener('mousemove', surMouvement);
      editor.off('transaction', rafraichir);
      window.removeEventListener('scroll', rafraichir, true);
      window.removeEventListener('resize', rafraichir);
    };
  }, [editor]);

  if (editor.isDestroyed || !editor.isEditable) {
    return null;
  }
  const actif = glisse ?? survole;
  const table = actif === null ? null : elementDuTableau(editor, actif.position);
  if (actif === null || table === null) {
    return null;
  }
  const { position } = actif;
  const cadre = table.getBoundingClientRect();
  const noeud = editor.state.doc.nodeAt(position);
  const colonnes = noeud?.firstChild?.childCount ?? 1;
  const lignes = noeud?.childCount ?? 1;

  const commencer = (sens: Glissement['sens']) => (evenement: ReactPointerEvent<HTMLButtonElement>) => {
    evenement.preventDefault();
    evenement.currentTarget.setPointerCapture(evenement.pointerId);
    glissement.current = {
      sens,
      position,
      depart: sens === 'colonne' ? evenement.clientX : evenement.clientY,
      pas: Math.max(24, sens === 'colonne' ? cadre.width / colonnes : cadre.height / lignes),
      fait: 0,
      bouge: false,
    };
    definirGlisse(actif);
  };

  const suivre = (evenement: ReactPointerEvent<HTMLButtonElement>): void => {
    const geste = glissement.current;
    if (geste === null) {
      return;
    }
    const ecart = (geste.sens === 'colonne' ? evenement.clientX : evenement.clientY) - geste.depart;
    if (Math.abs(ecart) >= seuilDeGlissement) {
      geste.bouge = true;
    }
    const voulu = Math.round(ecart / geste.pas);
    while (geste.fait !== voulu) {
      const commande = geste.fait < voulu ? agrandir(geste.sens, geste.position) : reduire(geste.sens, geste.position);
      const transaction = commande(editor.state);
      if (transaction === null) {
        // Colonne ou ligne non vide : on ne retire rien de plus.
        break;
      }
      editor.view.dispatch(transaction);
      geste.fait += geste.fait < voulu ? 1 : -1;
    }
  };

  const finir = (): void => {
    const geste = glissement.current;
    glissement.current = null;
    definirGlisse(null);
    if (geste !== null && !geste.bouge) {
      const transaction = agrandir(geste.sens, geste.position)(editor.state);
      if (transaction !== null) {
        editor.view.dispatch(transaction);
      }
    }
  };

  const poignee = 'bg-texte/10 hover:bg-accent/30 active:bg-accent/40 text-discret fixed z-20 flex items-center justify-center rounded touch-none';
  const sansFocus = (evenement: { preventDefault(): void }): void => evenement.preventDefault();
  return actif.bord === 'droit' ? (
    <button
      type="button"
      data-poignee-tableau
      title="Ajouter une colonne. Tirer vers la droite pour en ajouter plusieurs, vers la gauche pour retirer les colonnes vides."
      aria-label="Ajouter une colonne"
      onMouseDown={sansFocus}
      onPointerDown={commencer('colonne')}
      onPointerMove={suivre}
      onPointerUp={finir}
      onPointerCancel={finir}
      style={{ left: cadre.right + ecartDuBord, top: cadre.top, height: cadre.height, width: epaisseur }}
      className={`${poignee} cursor-col-resize`}
    >
      <Plus className="size-3.5" aria-hidden="true" />
    </button>
  ) : (
    <button
      type="button"
      data-poignee-tableau
      title="Ajouter une ligne. Tirer vers le bas pour en ajouter plusieurs, vers le haut pour retirer les lignes vides."
      aria-label="Ajouter une ligne"
      onMouseDown={sansFocus}
      onPointerDown={commencer('ligne')}
      onPointerMove={suivre}
      onPointerUp={finir}
      onPointerCancel={finir}
      // Dans l'espace entre le tableau et le bloc suivant.
      style={{ left: cadre.left, top: cadre.bottom + ecartDuBord, width: cadre.width, height: epaisseur }}
      className={`${poignee} cursor-row-resize`}
    >
      <Plus className="size-3.5" aria-hidden="true" />
    </button>
  );
}
