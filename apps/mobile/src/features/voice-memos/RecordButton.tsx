import { Mic, Square } from 'lucide-react';
import { dureeLisible } from './memo-labels';
import { useMemos } from './MemosContext';

/**
 * Bouton micro rond, en bas à droite de l'accueil seulement (choix d'Eloi,
 * 2026-10-11). Un toucher lance l'enregistrement. Pendant un enregistrement
 * dont l'écran a été quitté par Retour, une barre le rappelle : la toucher
 * rouvre l'écran, « Terminer » l'arrête.
 */
export function RecordButton() {
  const { demarrer, enregistrement, ecranVisible, montrerEcran, terminer } = useMemos();
  if (enregistrement !== null && ecranVisible) {
    return null;
  }
  return (
    <div className="marge-bas pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-end px-5 pb-5">
      {enregistrement === null ? (
        <button
          type="button"
          aria-label="Enregistrer un mémo vocal"
          onClick={() => void demarrer()}
          className="pointer-events-auto flex size-16 items-center justify-center rounded-full bg-accent text-white shadow-lg outline-none active:brightness-90 focus-visible:brightness-110"
        >
          <Mic className="size-7" aria-hidden="true" />
        </button>
      ) : (
        <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-surface p-1.5 shadow-lg">
          <button
            type="button"
            onClick={() => montrerEcran(true)}
            className="flex items-center gap-2 rounded-full px-3 py-2 outline-none active:bg-texte/10 focus-visible:bg-texte/15"
          >
            <Mic className="size-5 animate-pulse text-erreur" aria-hidden="true" />
            <span className="tabular-nums">{dureeLisible(Date.now() - enregistrement.depuis)}</span>
          </button>
          <button
            type="button"
            onClick={() => void terminer()}
            className="flex items-center gap-2 rounded-full bg-accent px-4 py-2 font-medium text-white outline-none active:brightness-90 focus-visible:brightness-110"
          >
            <Square className="size-4 fill-current" aria-hidden="true" />
            Terminer
          </button>
        </div>
      )}
    </div>
  );
}
