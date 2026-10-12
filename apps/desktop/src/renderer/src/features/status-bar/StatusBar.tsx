import { CloudAlert, CloudCheck, CloudOff, Clock, RefreshCw, TriangleAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { SyncStatusKind } from '@notes/core';
import { SpellCounter } from '../spellcheck/SpellCounter';
import { SyncPanel } from './SyncPanel';
import { libelleDeSync } from './sync-labels';
import { useSyncStatus } from './useSyncStatus';

const icones: Record<SyncStatusKind, { icone: LucideIcon; couleur: string }> = {
  desactivee: { icone: CloudOff, couleur: 'text-discret' },
  en_cours: { icone: RefreshCw, couleur: 'text-accent' },
  synchronise: { icone: CloudCheck, couleur: 'text-succes' },
  en_attente: { icone: Clock, couleur: 'text-alerte' },
  injoignable: { icone: CloudAlert, couleur: 'text-erreur' },
  conflit: { icone: TriangleAlert, couleur: 'text-alerte' },
};

/**
 * Barre de statut en bas de la fenêtre (README §7) : l'état de la sync, dont
 * un clic ouvre le détail au-dessus, et le nombre
 * de fautes de la page (§11).
 */
export function StatusBar({ surResolution }: { surResolution: (sauvegarde: string) => void }) {
  const etat = useSyncStatus();
  const [ouvert, definirOuvert] = useState(false);
  const [maintenant, definirMaintenant] = useState(() => Date.now());
  const conteneur = useRef<HTMLDivElement>(null);
  const bouton = useRef<HTMLButtonElement>(null);

  // L'heure affichée (« hier à… ») suit le passage des jours sans attendre un cycle.
  useEffect(() => {
    definirMaintenant(Date.now());
    const minuteur = setInterval(() => definirMaintenant(Date.now()), 60_000);
    return () => clearInterval(minuteur);
  }, [etat]);

  useEffect(() => {
    if (!ouvert) {
      return;
    }
    const fermerSiDehors = (evenement: MouseEvent): void => {
      if (conteneur.current !== null && !conteneur.current.contains(evenement.target as Node)) {
        definirOuvert(false);
      }
    };
    document.addEventListener('mousedown', fermerSiDehors);
    return () => document.removeEventListener('mousedown', fermerSiDehors);
  }, [ouvert]);

  if (etat === null) {
    return (
      <footer className="bg-surface text-discret flex h-7 shrink-0 items-center justify-end gap-2 px-2 text-xs">
        <SpellCounter />
      </footer>
    );
  }
  const { icone: Icone, couleur } = icones[etat.etat];
  const libelle = libelleDeSync(etat, maintenant);
  return (
    <footer className="bg-surface text-discret relative flex h-7 shrink-0 items-center px-2 text-xs">
      <div
        ref={conteneur}
        className="relative"
        onKeyDown={(evenement) => {
          if (evenement.key === 'Escape' && ouvert) {
            evenement.stopPropagation();
            definirOuvert(false);
            bouton.current?.focus();
          }
        }}
      >
        <button
          ref={bouton}
          type="button"
          onClick={() => definirOuvert((actuel) => !actuel)}
          aria-expanded={ouvert}
          aria-haspopup="dialog"
          className={`hover:bg-texte/10 focus-visible:bg-texte/20 flex items-center gap-1.5 rounded px-1.5 py-0.5 outline-0 ${ouvert ? 'bg-texte/10' : ''}`}
        >
          <Icone className={`size-3.5 ${couleur} ${etat.etat === 'en_cours' ? 'animate-spin' : ''}`} aria-hidden="true" />
          {libelle}
        </button>
        {/* Annonce pour les lecteurs d'écran. Hors du bouton : dedans, elle le priverait de son nom. */}
        <span role="status" className="sr-only">
          {etat.etat === 'en_cours' ? '' : libelle}
        </span>
        {ouvert && <SyncPanel
            etat={etat}
            maintenant={maintenant}
            surFermeture={() => {
              definirOuvert(false);
              bouton.current?.focus();
            }}
            surResolution={(sauvegarde) => {
              definirOuvert(false);
              surResolution(sauvegarde);
            }}
          />}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <SpellCounter />
      </div>
    </footer>
  );
}
