import type { ComponentProps } from 'react';
import { PageSearch } from './PageSearch';

/**
 * Recherche de pages en fenêtre, comme celle de Notion (docs/spec/interface.md) : ouverte par la
 * loupe du panneau ou `Ctrl+Maj+F` quand la barre de recherche du poste n'est pas installée.
 * Échap ou un clic à côté la ferme ; une page choisie la ferme aussi.
 */
export function PageSearchDialog({ surOuverture, surFermeture, ...recherche }: Omit<ComponentProps<typeof PageSearch>, 'surCreation' | 'surFermeture'> & { surFermeture: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[14vh]" onMouseDown={surFermeture}>
      <div role="dialog" aria-modal="true" aria-label="Chercher une page" className="bg-fond w-full max-w-xl rounded-2xl p-2 shadow-2xl shadow-black/50" onMouseDown={(evenement) => evenement.stopPropagation()}>
        <PageSearch
          {...recherche}
          surOuverture={(cle) => {
            surFermeture();
            surOuverture(cle);
          }}
          surFermeture={surFermeture}
        />
      </div>
    </div>
  );
}
