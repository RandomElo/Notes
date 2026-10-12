import type { TreeNode } from '@notes/core';
import { Trash2 } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

interface DeleteConfirmationProps {
  noeuds: TreeNode[];
  /** Où l'afficher : sous la ligne ou au point du menu qui l'a demandée. */
  x: number;
  y: number;
  surConfirmation: () => void;
  surAbandon: () => void;
}

/** Nombre de sous-pages (et éléments) sous ces pages, à toute profondeur. */
export function nombreDeSousPages(noeuds: readonly TreeNode[]): number {
  return noeuds.reduce((total, noeud) => total + noeud.enfants.length + nombreDeSousPages(noeud.enfants), 0);
}

/**
 * Confirmation avant de mettre à la corbeille une page qui a des sous-pages
 * (choix d'Eloi, docs/spec/corbeille.md), affichée à côté de la ligne. `Entrée` confirme,
 * `Échap` ou un clic ailleurs abandonne.
 */
export function DeleteConfirmation({ noeuds, x, y, surConfirmation, surAbandon }: DeleteConfirmationProps) {
  const boite = useRef<HTMLDivElement>(null);
  const confirmer = useRef<HTMLButtonElement>(null);
  const [position, definirPosition] = useState({ gauche: x, haut: y });
  const sousPages = nombreDeSousPages(noeuds);
  const [premiere] = noeuds;
  const texteDesSousPages = sousPages === 1 ? 'une sous-page' : `${sousPages} sous-pages`;
  const message =
    noeuds.length === 1 && premiere !== undefined
      ? `« ${premiere.titre} » a ${texteDesSousPages} : elles partent aussi à la corbeille.`
      : `Les ${noeuds.length} pages partent à la corbeille avec leurs sous-pages (${texteDesSousPages}).`;

  // Elle ne doit pas déborder de la fenêtre.
  useLayoutEffect(() => {
    const rectangle = boite.current?.getBoundingClientRect();
    if (rectangle !== undefined) {
      definirPosition({
        gauche: Math.max(4, Math.min(x, window.innerWidth - rectangle.width - 4)),
        haut: Math.max(4, Math.min(y, window.innerHeight - rectangle.height - 4)),
      });
    }
    confirmer.current?.focus();
  }, [x, y]);

  useEffect(() => {
    const abandonSiDehors = (evenement: MouseEvent) => {
      if (!boite.current?.contains(evenement.target as Node)) {
        surAbandon();
      }
    };
    window.addEventListener('mousedown', abandonSiDehors);
    return () => window.removeEventListener('mousedown', abandonSiDehors);
  }, [surAbandon]);

  return (
    <div
      ref={boite}
      role="alertdialog"
      aria-modal="true"
      aria-label="Mettre à la corbeille"
      onKeyDown={(evenement) => {
        evenement.stopPropagation();
        if (evenement.key === 'Escape') {
          evenement.preventDefault();
          surAbandon();
        }
      }}
      style={{ left: position.gauche, top: position.haut }}
      className="border-bordure bg-surface fixed z-50 w-80 space-y-3 rounded-md border p-3 text-sm shadow-xl shadow-black/40"
    >
      <p>{message}</p>
      <div className="flex justify-end gap-2 whitespace-nowrap">
        <button
          type="button"
          onClick={surAbandon}
          className="hover:bg-texte/10 focus-visible:bg-texte/20 inline-flex h-8 items-center rounded-md px-3 font-medium outline-0"
        >
          Annuler
        </button>
        <button
          ref={confirmer}
          type="button"
          onClick={surConfirmation}
          className="bg-erreur/20 hover:bg-erreur/35 focus-visible:bg-erreur/45 inline-flex h-8 items-center gap-2 rounded-md px-3 font-medium outline-0"
        >
          <Trash2 className="size-4 shrink-0" aria-hidden="true" />
          Mettre à la corbeille
        </button>
      </div>
    </div>
  );
}
