import { natureDIcone } from '@notes/core';
import { Smile } from 'lucide-react';
import { PageIcon } from './PageIcon';

interface PageHeaderIconProps {
  icone: string | null;
  chemin: string;
  lectureSeule: boolean;
  /** Ouvre le choix de l'icône sous ce point. */
  surOuverture: (x: number, y: number) => void;
}

/**
 * Icône en haut de la page, au-dessus du titre, comme dans Notion : un clic
 * ouvre son choix. Sans icône, « Ajouter une icône » apparaît au survol du
 * haut de la page (ou au focus clavier).
 */
export function PageHeaderIcon({ icone, chemin, lectureSeule, surOuverture }: PageHeaderIconProps) {
  const ouvrir = (element: HTMLElement): void => {
    const boite = element.getBoundingClientRect();
    surOuverture(boite.left, boite.bottom + 6);
  };
  if (natureDIcone(icone) !== null) {
    return (
      <button
        type="button"
        disabled={lectureSeule}
        aria-label="Changer l'icône de la page"
        title="Changer l'icône"
        onClick={(evenement) => ouvrir(evenement.currentTarget)}
        className="hover:bg-texte/10 focus-visible:bg-texte/15 mt-2 -ml-1 flex rounded-md p-1 outline-0 disabled:hover:bg-transparent"
      >
        <PageIcon icone={icone} chemin={chemin} className="size-14 text-5xl" />
      </button>
    );
  }
  if (lectureSeule) {
    return null;
  }
  return (
    <button
      type="button"
      onClick={(evenement) => ouvrir(evenement.currentTarget)}
      className="text-discret hover:bg-texte/10 focus-visible:bg-texte/15 -mb-2.5 -ml-1.5 flex h-7 items-center gap-1.5 rounded px-1.5 text-sm opacity-0 outline-0 group-hover/entete:opacity-100 focus-visible:opacity-100"
    >
      <Smile className="size-4" aria-hidden="true" />
      Ajouter une icône
    </button>
  );
}
