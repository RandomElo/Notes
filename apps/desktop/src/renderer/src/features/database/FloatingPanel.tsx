import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

interface FloatingPanelProps {
  /** Position du clic qui a ouvert le panneau. */
  x: number;
  y: number;
  libelle: string;
  surFermeture: () => void;
  children: ReactNode;
}

/** Panneau flottant d'une base (liste des choix, valeurs possibles) : gardé dans la fenêtre, fermé par Échap ou un clic ailleurs. */
export function FloatingPanel({ x, y, libelle, surFermeture, children }: FloatingPanelProps) {
  const panneau = useRef<HTMLDivElement>(null);
  const [position, definirPosition] = useState({ gauche: x, haut: y });

  useLayoutEffect(() => {
    const boite = panneau.current?.getBoundingClientRect();
    if (boite !== undefined) {
      definirPosition({
        gauche: Math.max(4, Math.min(x, window.innerWidth - boite.width - 4)),
        haut: Math.max(4, Math.min(y, window.innerHeight - boite.height - 4)),
      });
    }
  }, [x, y]);

  useEffect(() => {
    const fermerSiDehors = (evenement: MouseEvent): void => {
      if (!panneau.current?.contains(evenement.target as Node)) {
        surFermeture();
      }
    };
    window.addEventListener('mousedown', fermerSiDehors);
    window.addEventListener('blur', surFermeture);
    return () => {
      window.removeEventListener('mousedown', fermerSiDehors);
      window.removeEventListener('blur', surFermeture);
    };
  }, [surFermeture]);

  return (
    <div
      ref={panneau}
      role="dialog"
      aria-label={libelle}
      onKeyDown={(evenement) => {
        if (evenement.key === 'Escape') {
          evenement.preventDefault();
          surFermeture();
        }
        evenement.stopPropagation();
      }}
      style={{ left: position.gauche, top: position.haut }}
      className="border-bordure bg-surface fixed z-50 w-64 rounded-md border p-1 text-sm shadow-xl shadow-black/40"
    >
      {children}
    </div>
  );
}
