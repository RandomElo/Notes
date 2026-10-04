import { Plus, X } from 'lucide-react';
import type { MouseEvent } from 'react';
import type { Tab } from './tabs-model';

export interface TabView extends Tab {
  titre: string;
  /** La page a des modifications que le NAS n'a pas encore. */
  enAttente: boolean;
}

interface TabBarProps {
  onglets: TabView[];
  actif: string;
  surActivation: (id: string) => void;
  surFermeture: (id: string) => void;
  surNouveau: () => void;
}

/**
 * Onglets, dans la barre de titre comme dans Firefox. Clic du milieu pour
 * fermer. Le point dit que la page n'est pas encore sur le NAS. Les états
 * se montrent par le fond, jamais par un contour.
 */
export function TabBar({ onglets, actif, surActivation, surFermeture, surNouveau }: TabBarProps) {
  return (
    <div className="flex min-w-0 items-stretch gap-0.5 py-1">
      <div role="tablist" aria-label="Onglets" className="flex min-w-0 items-stretch gap-0.5">
        {onglets.map((onglet, rang) => {
          const estActif = onglet.id === actif;
          const raccourci = rang < 9 ? ` (Ctrl+${rang + 1})` : '';
          return (
            <div
              key={onglet.id}
              className={`hors-deplacement group flex w-44 min-w-16 shrink items-center rounded-md text-xs ${
                estActif ? 'bg-texte/15 text-texte' : 'bg-texte/5 text-discret hover:bg-texte/10 hover:text-texte'
              }`}
              onAuxClick={(evenement: MouseEvent) => {
                if (evenement.button === 1) {
                  evenement.preventDefault();
                  surFermeture(onglet.id);
                }
              }}
            >
              <button
                type="button"
                role="tab"
                aria-selected={estActif}
                title={`${onglet.titre}${onglet.enAttente ? ', pas encore synchronisée' : ''}${raccourci}`}
                onClick={() => surActivation(onglet.id)}
                onMouseDown={(evenement) => {
                  // Le clic du milieu ne doit pas faire défiler la page.
                  if (evenement.button === 1) {
                    evenement.preventDefault();
                  }
                }}
                className={`flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-md pl-2.5 outline-0 ${estActif ? 'focus-visible:bg-accent/30' : 'focus-visible:bg-texte/20'}`}
              >
                {onglet.enAttente && <span aria-hidden="true" className="bg-alerte size-1.5 shrink-0 rounded-full" />}
                <span className="truncate">{onglet.titre}</span>
                {onglet.enAttente && <span className="sr-only">, pas encore synchronisée</span>}
              </button>
              <button
                type="button"
                aria-label={`Fermer l'onglet ${onglet.titre}`}
                title="Fermer (Ctrl+W)"
                onClick={() => surFermeture(onglet.id)}
                className={`hover:bg-texte/20 focus-visible:bg-texte/25 mr-1 flex size-5 shrink-0 items-center justify-center rounded outline-0 ${
                  estActif ? '' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
                }`}
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={surNouveau}
        aria-label="Nouvel onglet"
        title="Nouvel onglet (Ctrl+T)"
        className="hors-deplacement text-discret hover:bg-texte/10 hover:text-texte focus-visible:bg-texte/20 focus-visible:text-texte flex w-7 shrink-0 items-center justify-center rounded-md outline-0"
      >
        <Plus className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
