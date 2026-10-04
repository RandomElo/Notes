import { extraireSommaire } from '@notes/document';
import type { OutlineEntry } from '@notes/document';
import type { Editor } from '@tiptap/react';
import { useEffect, useState } from 'react';

/** Hauteur de la barre collée en haut de la page, qui cache ce qui passe dessous. */
const hauteurDuHaut = 56;
/** Un titre arrivé juste sous la barre, à cette distance, est déjà celui qu'on lit. */
const margeSousLeHaut = 24;

export interface Outline {
  entrees: OutlineEntry[];
  /** Rang du titre où en est la lecture, -1 si la page n'a pas de titre. */
  courant: number;
}

/**
 * Titres de la page ouverte, recalculés à chaque changement du contenu
 * (frappe, rechargement depuis le disque), et titre où en est la lecture,
 * suivi par un IntersectionObserver sur la zone qui défile.
 */
export function useOutline(editeur: Editor | null): Outline {
  const [entrees, definirEntrees] = useState<OutlineEntry[]>([]);
  const [courant, definirCourant] = useState(-1);

  useEffect(() => {
    if (editeur === null) {
      definirEntrees([]);
      return;
    }
    let image: number | null = null;
    const relire = (): void => {
      image = null;
      if (!editeur.isDestroyed) {
        const nouvelles = extraireSommaire(editeur.state.doc);
        definirEntrees((anciennes) => (JSON.stringify(anciennes) === JSON.stringify(nouvelles) ? anciennes : nouvelles));
      }
    };
    // Une fois par image : une rafale de frappes ne recalcule le sommaire qu'une fois.
    const surTransaction = ({ transaction }: { transaction: { docChanged: boolean } }): void => {
      if (transaction.docChanged && image === null) {
        image = requestAnimationFrame(relire);
      }
    };
    relire();
    editeur.on('transaction', surTransaction);
    return () => {
      editeur.off('transaction', surTransaction);
      if (image !== null) {
        cancelAnimationFrame(image);
      }
    };
  }, [editeur]);

  useEffect(() => {
    if (editeur === null || editeur.isDestroyed || entrees.length === 0) {
      definirCourant(-1);
      return;
    }
    const zone = editeur.view.dom.closest('main');
    const elements = entrees.map((entree) => editeur.view.nodeDOM(entree.position)).filter((noeud): noeud is HTMLElement => noeud instanceof HTMLElement);
    // Le titre en cours est le dernier passé sous la barre du haut, le premier titre tant qu'aucun ne l'est.
    // En bas de page, quand plus rien ne peut monter jusque-là, c'est le dernier titre visible.
    const calculer = (): void => {
      const cadre = zone?.getBoundingClientRect() ?? { top: 0, bottom: window.innerHeight };
      const enBas = zone !== null && zone.scrollTop + zone.clientHeight >= zone.scrollHeight - 2;
      const seuil = enBas ? cadre.bottom : cadre.top + hauteurDuHaut + margeSousLeHaut;
      let rang = 0;
      elements.forEach((element, index) => {
        if (element.getBoundingClientRect().top <= seuil) {
          rang = index;
        }
      });
      definirCourant(rang);
    };
    // L'observateur prévient quand un titre passe sous la barre du haut (ou en revient) : on recalcule alors tout.
    // Le défilement jusqu'en bas ne fait passer aucun titre sous la barre : il est suivi à part, une fois par image.
    const observateur = new IntersectionObserver(calculer, { root: zone, rootMargin: `-${hauteurDuHaut + margeSousLeHaut}px 0px 0px 0px`, threshold: [0, 1] });
    elements.forEach((element) => observateur.observe(element));
    let image: number | null = null;
    let etaitEnBas = false;
    const surDefilement = (): void => {
      image ??= requestAnimationFrame(() => {
        image = null;
        const enBas = zone !== null && zone.scrollTop + zone.clientHeight >= zone.scrollHeight - 2;
        if (enBas || etaitEnBas) {
          calculer();
        }
        etaitEnBas = enBas;
      });
    };
    zone?.addEventListener('scroll', surDefilement, { passive: true });
    calculer();
    return () => {
      observateur.disconnect();
      zone?.removeEventListener('scroll', surDefilement);
      if (image !== null) {
        cancelAnimationFrame(image);
      }
    };
  }, [editeur, entrees]);

  return { entrees, courant };
}

/** Emmène la vue et le curseur au début d'un titre. */
export function allerAuTitre(editeur: Editor, entree: OutlineEntry): void {
  const element = editeur.view.nodeDOM(entree.position);
  if (element instanceof HTMLElement) {
    element.scrollIntoView({ block: 'start' });
  }
  editeur.chain().setTextSelection(entree.position + 1).focus(undefined, { scrollIntoView: false }).run();
}

/** Libellé d'un titre dans le sommaire : un titre vide existe dans la page, il lui faut quand même un nom. */
export const libelleDuTitre = (entree: OutlineEntry): string => (entree.texte === '' ? 'Titre sans texte' : entree.texte);
