import { X } from 'lucide-react';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { useFermetureParRetour } from '../state/navigation';
import { BoutonIcone } from './TopBar';

/** Tant qu'une feuille est ouverte, la page derrière ne défile pas. */
function useDefilementBloque(): void {
  useEffect(() => {
    const avant = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = avant;
    };
  }, []);
}

/**
 * Feuille du bas, fermée par le fond, la croix ou le bouton Retour d'Android.
 * `haute` : elle prend presque tout l'écran, son contenu se partage la hauteur (éditeur).
 */
export function Sheet({ titre, fermer, children, haute = false }: { titre: string; fermer: () => void; children: ReactNode; haute?: boolean }) {
  useFermetureParRetour(true, fermer);
  useDefilementBloque();
  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end overscroll-contain" role="dialog" aria-label={titre}>
      <div className="absolute inset-0 bg-black/50" onClick={fermer} />
      <div className={`marge-bas relative flex flex-col rounded-t-2xl bg-surface pb-3 shadow-xl ${haute ? 'h-[92dvh]' : 'max-h-[85dvh] overflow-y-auto'}`}>
        <div className="sticky top-0 z-10 flex shrink-0 items-center bg-surface pr-1 pl-5">
          <span className="flex-1 truncate py-3 font-medium">{titre}</span>
          <BoutonIcone libelle="Fermer" onClick={fermer}>
            <X className="size-5" />
          </BoutonIcone>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Ligne d'action d'une feuille. */
export function ActionDeFeuille({ icone, libelle, onClick, desactive = false }: { icone: ReactNode; libelle: string; onClick: () => void; desactive?: boolean }) {
  return (
    <button
      type="button"
      disabled={desactive}
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left outline-none active:bg-texte/10 focus-visible:bg-texte/15 disabled:text-discret/60"
    >
      <span className="text-discret">{icone}</span>
      {libelle}
    </button>
  );
}
