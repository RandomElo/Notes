import type { MouseEvent, ReactNode } from 'react';

export interface SubpageEntry {
  /** Ce qui identifie la page pour l'application (chemin ou identifiant). */
  cle: string;
  titre: string;
}

interface SubpagesBlockProps {
  pages: readonly SubpageEntry[];
  /** Icône d'une sous-page, dessinée par l'application. */
  icone: (page: SubpageEntry) => ReactNode;
  ouvrir: (page: SubpageEntry, evenement: MouseEvent) => void;
  /** Absent : pas de « Nouvelle sous-page » (lecture seule). */
  creer?: () => void;
}

/**
 * Les sous-pages d'une page, en blocs sous son titre, comme sur Notion (choix
 * d'Eloi du 2026-10-11) : seulement affichées, calculées depuis
 * l'arborescence, jamais écrites dans le fichier ni exportées. Une ligne
 * ouvre la sous-page ; « Nouvelle sous-page » en crée une autre.
 */
export function SubpagesBlock({ pages, icone, ouvrir, creer }: SubpagesBlockProps) {
  // Sans sous-page, rien : une ligne « Nouvelle sous-page » sur chaque page encombrerait (l'arborescence et « / » en créent).
  if (pages.length === 0) {
    return null;
  }
  const ligne = 'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left outline-0 hover:bg-texte/10 focus-visible:bg-texte/15 active:bg-texte/15';
  return (
    <nav aria-label="Sous-pages" className="mb-4 flex flex-col">
      {pages.map((page) => (
        <button key={page.cle} type="button" onClick={(evenement) => ouvrir(page, evenement)} onAuxClick={(evenement) => ouvrir(page, evenement)} className={ligne}>
          <span className="flex w-5 shrink-0 justify-center text-[1.05em]">{icone(page)}</span>
          <span className="min-w-0 truncate underline decoration-texte/25 underline-offset-4">{page.titre}</span>
        </button>
      ))}
      {creer !== undefined && (
        <button type="button" onClick={creer} className={`${ligne} text-discret`}>
          <span className="flex w-5 shrink-0 justify-center text-[1.05em]" aria-hidden="true">
            +
          </span>
          Nouvelle sous-page
        </button>
      )}
    </nav>
  );
}
