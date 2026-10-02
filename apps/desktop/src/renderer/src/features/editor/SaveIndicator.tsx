import type { SaveState } from './page-saver';

const libelles: Record<Exclude<SaveState['genre'], 'erreur'>, string> = {
  enregistre: 'Enregistré',
  modifie: 'Modifié',
  enregistrement: 'Enregistrement…',
};

/** État de l'enregistrement de la page ouverte. Discret quand tout va bien, visible en cas d'échec. */
export function SaveIndicator({ etat }: { etat: SaveState }) {
  return (
    <p role="status" aria-live="polite" className={`shrink-0 text-xs ${etat.genre === 'erreur' ? 'text-erreur' : 'text-discret'}`}>
      {etat.genre === 'erreur' ? `Non enregistré : ${etat.message} Nouvel essai dans quelques secondes.` : libelles[etat.genre]}
    </p>
  );
}
