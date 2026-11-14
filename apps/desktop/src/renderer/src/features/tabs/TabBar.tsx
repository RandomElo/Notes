import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import type { DragEvent, MouseEvent } from 'react';
import { PageIcon } from '../page-icon/PageIcon';
import type { Tab } from './tabs-model';

export interface TabView extends Tab {
  titre: string;
  /** Icône de la page et son dossier (une icône image est dans ses `assets/`). */
  icone: string | null;
  chemin: string;
  /** La page a des modifications que le NAS n'a pas encore. */
  enAttente: boolean;
}

interface TabBarProps {
  onglets: TabView[];
  actif: string | null;
  surActivation: (id: string) => void;
  surFermeture: (id: string) => void;
  surNouveau: () => void;
  /** Onglet glissé vers une autre place, comptée parmi les onglets avant le déplacement. */
  surDeplacement: (id: string, rang: number) => void;
}

/** Type des données glissées : seul un onglet de cette barre peut y être déposé. */
const TYPE_ONGLET = 'application/x-notes-onglet';

/**
 * Onglets, dans la barre de titre comme dans Firefox. Clic du milieu pour
 * fermer, glisser pour changer leur ordre. Le point dit que la page n'est pas
 * encore sur le NAS. Les états se montrent par le fond, jamais par un contour.
 */
export function TabBar({ onglets, actif, surActivation, surFermeture, surNouveau, surDeplacement }: TabBarProps) {
  const [glisse, definirGlisse] = useState<string | null>(null);
  // Place visée pendant le glisser : l'onglet de ce rang sera poussé à droite.
  const [place, definirPlace] = useState<number | null>(null);

  const survol = (evenement: DragEvent<HTMLDivElement>, rang: number) => {
    if (glisse === null || !evenement.dataTransfer.types.includes(TYPE_ONGLET)) {
      return;
    }
    evenement.preventDefault();
    evenement.dataTransfer.dropEffect = 'move';
    const boite = evenement.currentTarget.getBoundingClientRect();
    definirPlace(evenement.clientX < boite.left + boite.width / 2 ? rang : rang + 1);
  };
  const finir = () => {
    definirGlisse(null);
    definirPlace(null);
  };

  return (
    <div className="flex min-w-0 items-stretch gap-0.5 py-1">
      <div role="tablist" aria-label="Onglets" className="flex min-w-0 items-stretch gap-0.5">
        {onglets.map((onglet, rang) => {
          const estActif = onglet.id === actif;
          return (
            <div
              key={onglet.id}
              draggable
              onDragStart={(evenement) => {
                evenement.dataTransfer.setData(TYPE_ONGLET, onglet.id);
                evenement.dataTransfer.effectAllowed = 'move';
                definirGlisse(onglet.id);
              }}
              onDragOver={(evenement) => survol(evenement, rang)}
              onDrop={(evenement) => {
                evenement.preventDefault();
                if (glisse !== null && place !== null) {
                  surDeplacement(glisse, place);
                }
                finir();
              }}
              onDragEnd={finir}
              className={`hors-deplacement group relative flex w-44 min-w-12 shrink items-center rounded-md text-xs ${
                estActif ? 'bg-texte/15 text-texte' : 'bg-texte/5 text-discret hover:bg-texte/10 hover:text-texte'
              } ${glisse === onglet.id ? 'opacity-50' : ''}`}
              onAuxClick={(evenement: MouseEvent) => {
                if (evenement.button === 1) {
                  evenement.preventDefault();
                  surFermeture(onglet.id);
                }
              }}
            >
              {place !== null && glisse !== null && (place === rang || (place === rang + 1 && rang === onglets.length - 1)) && (
                <span aria-hidden="true" className={`bg-accent pointer-events-none absolute inset-y-1 w-0.5 rounded-full ${place === rang ? '-left-0.5' : '-right-0.5'}`} />
              )}
              <button
                type="button"
                role="tab"
                aria-selected={estActif}
                title={`${onglet.titre}${onglet.enAttente ? ', pas encore synchronisée' : ''}`}
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
                <PageIcon icone={onglet.icone} chemin={onglet.chemin} className="size-3.5 text-xs" />
                <span className="truncate">{onglet.titre}</span>
                {onglet.enAttente && <span className="sr-only">, pas encore synchronisée</span>}
              </button>
              <button
                type="button"
                aria-label={`Fermer l'onglet ${onglet.titre}`}
                title="Fermer"
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
        title="Nouvel onglet"
        className="hors-deplacement text-discret hover:bg-texte/10 hover:text-texte focus-visible:bg-texte/20 focus-visible:text-texte flex w-7 shrink-0 items-center justify-center rounded-md outline-0"
      >
        <Plus className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
