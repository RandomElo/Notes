import { useRef, useState } from 'react';
import type { ReactNode, TouchEvent } from 'react';

const seuil = 70;

/** Tirer la liste vers le bas, depuis son haut, relance une sync (README §5). */
export function PullToRefresh({ onRefresh, children }: { onRefresh: () => void; children: ReactNode }) {
  const depart = useRef<number | null>(null);
  const [tire, definirTire] = useState(0);

  const debut = (evenement: TouchEvent): void => {
    depart.current = window.scrollY <= 0 ? (evenement.touches[0]?.clientY ?? null) : null;
  };
  const mouvement = (evenement: TouchEvent): void => {
    const y = evenement.touches[0]?.clientY;
    if (depart.current !== null && y !== undefined) {
      definirTire(Math.max(0, Math.min(seuil * 1.5, (y - depart.current) / 2)));
    }
  };
  const fin = (): void => {
    if (tire >= seuil / 2) {
      onRefresh();
    }
    depart.current = null;
    definirTire(0);
  };

  return (
    <div onTouchStart={debut} onTouchMove={mouvement} onTouchEnd={fin} onTouchCancel={fin}>
      <div style={{ height: tire }} className="flex items-end justify-center overflow-hidden text-xs text-discret transition-[height]">
        {tire > 0 && (tire >= seuil / 2 ? 'Relâcher pour synchroniser' : 'Tirer pour synchroniser')}
      </div>
      {children}
    </div>
  );
}
