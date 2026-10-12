import type { LucideIcon } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

export interface MenuItem {
  libelle: string;
  icone: LucideIcon;
  raccourci?: string;
  action: () => void;
}

interface ContextMenuProps {
  /** Position du pointeur ou du bouton qui a ouvert le menu. */
  x: number;
  y: number;
  elements: MenuItem[];
  surFermeture: () => void;
  /** Fermé par Échap ou Tab, sans choix : le focus peut revenir à ce qui a ouvert le menu. */
  surAnnulation?: () => void;
}

/** Menu contextuel : se ferme sur Échap, sur un clic ailleurs ou après un choix. Navigable aux flèches. */
export function ContextMenu({ x, y, elements, surFermeture, surAnnulation }: ContextMenuProps) {
  const menu = useRef<HTMLDivElement>(null);
  const [position, definirPosition] = useState({ gauche: x, haut: y });

  // Le menu ne doit pas déborder de la fenêtre.
  useLayoutEffect(() => {
    const boite = menu.current?.getBoundingClientRect();
    if (boite !== undefined) {
      definirPosition({
        gauche: Math.max(4, Math.min(x, window.innerWidth - boite.width - 4)),
        haut: Math.max(4, Math.min(y, window.innerHeight - boite.height - 4)),
      });
    }
    menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  }, [x, y]);

  useEffect(() => {
    const fermerSiDehors = (evenement: MouseEvent) => {
      if (!menu.current?.contains(evenement.target as Node)) {
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

  const surTouche = (evenement: KeyboardEvent) => {
    const boutons = [...(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
    const rang = boutons.indexOf(document.activeElement as HTMLButtonElement);
    if (evenement.key === 'Escape' || evenement.key === 'Tab') {
      evenement.preventDefault();
      surFermeture();
      surAnnulation?.();
    } else if (evenement.key === 'ArrowDown' || evenement.key === 'ArrowUp') {
      evenement.preventDefault();
      const pas = evenement.key === 'ArrowDown' ? 1 : -1;
      boutons[(rang + pas + boutons.length) % boutons.length]?.focus();
    }
    evenement.stopPropagation();
  };

  return (
    <div
      ref={menu}
      role="menu"
      onKeyDown={surTouche}
      style={{ left: position.gauche, top: position.haut }}
      className="border-bordure bg-surface fixed z-50 min-w-48 rounded-md border py-1 shadow-xl shadow-black/40"
    >
      {elements.map((element) => (
        <button
          key={element.libelle}
          type="button"
          role="menuitem"
          onClick={() => {
            surFermeture();
            element.action();
          }}
          className="hover:bg-bordure/60 focus:bg-bordure/60 flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm outline-none"
        >
          <element.icone className="text-discret size-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">{element.libelle}</span>
          {element.raccourci !== undefined && <span className="text-discret text-xs">{element.raccourci}</span>}
        </button>
      ))}
    </div>
  );
}
