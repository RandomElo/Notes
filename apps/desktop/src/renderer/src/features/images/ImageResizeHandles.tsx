import { largeurMaxDImage, largeurMinDImage } from '@notes/document';
import type { ImageAttributes } from '@notes/document';
import type { Editor } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

type Bord = 'gauche' | 'droite';

interface Glissement {
  bord: Bord;
  position: number;
  departX: number;
  /** Largeur de l'image et place disponible dans son bloc au départ, en pixels. */
  largeurDepart: number;
  place: number;
  /** Une image centrée grandit des deux côtés : un pixel de geste en vaut deux. */
  facteur: number;
  largeur: number;
}

/** Le bloc image dont « figure » est la vue, et sa position dans le document. */
function positionDeLImage(editor: Editor, figure: Element): number | null {
  let trouve: number | null = null;
  editor.state.doc.descendants((noeud, position) => {
    if (trouve !== null) {
      return false;
    }
    if (noeud.type.name === 'image' && editor.view.nodeDOM(position) === figure) {
      trouve = position;
    }
    return !noeud.isTextblock && noeud.type.name !== 'image';
  });
  return trouve;
}

const borner = (valeur: number): number => Math.max(largeurMinDImage, Math.min(largeurMaxDImage, Math.round(valeur)));

/**
 * Poignées de taille d'une image, comme dans Notion (docs/spec/editeur.md) : au survol,
 * une barre sur chaque bord ; tirée, elle change la largeur pendant le geste,
 * et la page ne la reçoit qu'au lâcher. Une image centrée grandit des deux
 * côtés. La largeur est un pourcentage entier de 10 à 100 ; 100 ne s'écrit pas.
 */
export function ImageResizeHandles({ editor }: { editor: Editor }) {
  const [figure, definirFigure] = useState<HTMLElement | null>(null);
  const [geste, definirGeste] = useState<Glissement | null>(null);
  const glissement = useRef<Glissement | null>(null);
  const [, rafraichir] = useState(0);

  useEffect(() => {
    const surMouvement = (evenement: MouseEvent): void => {
      if (glissement.current !== null) {
        return;
      }
      const cible = evenement.target instanceof Element ? evenement.target : null;
      if (cible?.closest('[data-poignee-image]') != null) {
        return;
      }
      const trouvee = cible?.closest('figure[data-image]');
      const image = trouvee?.querySelector('img');
      const visible = trouvee instanceof HTMLElement && image instanceof HTMLImageElement && !image.hidden && editor.view.dom.contains(trouvee);
      definirFigure((actuelle) => {
        const nouvelle = visible && editor.isEditable ? trouvee : null;
        return actuelle === nouvelle ? actuelle : nouvelle;
      });
    };
    const suivre = (): void => rafraichir((compteur) => compteur + 1);
    document.addEventListener('mousemove', surMouvement);
    editor.on('transaction', suivre);
    window.addEventListener('scroll', suivre, true);
    window.addEventListener('resize', suivre);
    return () => {
      document.removeEventListener('mousemove', surMouvement);
      editor.off('transaction', suivre);
      window.removeEventListener('scroll', suivre, true);
      window.removeEventListener('resize', suivre);
    };
  }, [editor]);

  const image = figure?.isConnected === true ? figure.querySelector('img') : null;
  if (editor.isDestroyed || !editor.isEditable || figure === null || !(image instanceof HTMLImageElement)) {
    return null;
  }
  const cadre = image.getBoundingClientRect();

  const commencer = (bord: Bord) => (evenement: ReactPointerEvent<HTMLDivElement>) => {
    const position = positionDeLImage(editor, figure);
    if (position === null) {
      return;
    }
    evenement.preventDefault();
    evenement.currentTarget.setPointerCapture(evenement.pointerId);
    const style = getComputedStyle(figure);
    const place = figure.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const attributs = editor.state.doc.nodeAt(position)?.attrs as ImageAttributes | undefined;
    const debut: Glissement = {
      bord,
      position,
      departX: evenement.clientX,
      largeurDepart: cadre.width,
      place,
      facteur: (attributs?.alignement ?? 'centre') === 'centre' ? 2 : 1,
      largeur: attributs?.largeur ?? largeurMaxDImage,
    };
    glissement.current = debut;
    definirGeste(debut);
  };

  const suivreGeste = (evenement: ReactPointerEvent<HTMLDivElement>): void => {
    const courant = glissement.current;
    if (courant === null) {
      return;
    }
    const sens = courant.bord === 'droite' ? 1 : -1;
    const pixels = courant.largeurDepart + sens * (evenement.clientX - courant.departX) * courant.facteur;
    const largeur = borner((pixels / courant.place) * 100);
    if (largeur !== courant.largeur) {
      courant.largeur = largeur;
      // L'image suit le geste sans toucher au document : une seule modification, au lâcher.
      figure.style.setProperty('--largeur-image', `${largeur}%`);
      definirGeste({ ...courant });
    }
  };

  const finir = (): void => {
    const courant = glissement.current;
    glissement.current = null;
    definirGeste(null);
    if (courant === null) {
      return;
    }
    const noeud = editor.state.doc.nodeAt(courant.position);
    if (noeud?.type.name !== 'image') {
      return;
    }
    const largeur = courant.largeur >= largeurMaxDImage ? null : courant.largeur;
    if (largeur !== (noeud.attrs as ImageAttributes).largeur) {
      editor.view.dispatch(editor.state.tr.setNodeMarkup(courant.position, null, { ...noeud.attrs, largeur }));
    }
  };

  // Une zone large pour attraper le bord, la barre visible au milieu.
  const hauteur = Math.min(48, Math.max(20, cadre.height * 0.3));
  const poignee = (bord: Bord) => (
    <div
      key={bord}
      data-poignee-image
      role="separator"
      aria-orientation="vertical"
      aria-label={bord === 'gauche' ? "Taille de l'image, bord gauche" : "Taille de l'image, bord droit"}
      onPointerDown={commencer(bord)}
      onPointerMove={suivreGeste}
      onPointerUp={finir}
      onPointerCancel={finir}
      style={{ left: bord === 'gauche' ? cadre.left : cadre.right - 16, top: cadre.top, width: 16, height: cadre.height }}
      className="group fixed z-20 flex cursor-ew-resize touch-none items-center justify-center"
    >
      <span
        aria-hidden="true"
        style={{ height: hauteur }}
        className={`w-1.5 rounded-full border border-black/40 shadow-sm ${geste?.bord === bord ? 'bg-white' : 'bg-white/80 group-hover:bg-white'}`}
      />
    </div>
  );

  return (
    <>
      {poignee('gauche')}
      {poignee('droite')}
      {geste !== null && (
        <span
          aria-live="polite"
          style={{ left: cadre.left + cadre.width / 2, top: cadre.top + 8 }}
          className="pointer-events-none fixed z-30 -translate-x-1/2 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white tabular-nums"
        >
          {geste.largeur} %
        </span>
      )}
    </>
  );
}
