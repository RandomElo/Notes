import type { ReactNode } from 'react';

/** Barre du haut de chaque écran, sous la barre d'état du système. */
export function TopBar({ gauche, titre, droite }: { gauche?: ReactNode; titre?: ReactNode; droite?: ReactNode }) {
  return (
    <header className="marge-haut sticky top-0 z-20 bg-fond">
      <div className="flex h-14 items-center gap-1 px-1">
        {gauche}
        <div className="min-w-0 flex-1 truncate px-2 text-base font-medium">{titre}</div>
        {droite}
      </div>
    </header>
  );
}

/** Bouton rond d'une icône, l'état se montre par le fond (jamais de contour). */
export function BoutonIcone({ libelle, onClick, children, desactive = false }: { libelle: string; onClick: () => void; children: ReactNode; desactive?: boolean }) {
  return (
    <button
      type="button"
      aria-label={libelle}
      title={libelle}
      disabled={desactive}
      onClick={onClick}
      className="flex size-11 shrink-0 items-center justify-center rounded-full text-texte outline-none active:bg-texte/15 focus-visible:bg-texte/20 disabled:text-discret/50"
    >
      {children}
    </button>
  );
}
