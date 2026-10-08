import { estFichierDeConflitDePage } from '@notes/core';
import { FolderOpen, GitMerge, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/ipc';
import type { SyncStatus } from '../../../../shared/ipc-contract';
import { libelleDeSync, momentDeSync } from './sync-labels';

interface SyncPanelProps {
  etat: SyncStatus;
  maintenant: number;
  surFermeture: () => void;
  /** Ouvre l'écran de résolution d'une version en conflit d'une page. */
  surResolution: (sauvegarde: string) => void;
}

const classeBouton = 'bg-texte/10 hover:bg-texte/20 focus-visible:bg-accent/40 rounded px-2 py-1 outline-0 disabled:opacity-50';

/**
 * Détail de la sync, ouvert depuis la barre de statut : dernière
 * synchronisation, versions en conflit gardées à côté, fichiers en souffrance,
 * et un bouton pour synchroniser tout de suite.
 */
export function SyncPanel({ etat, maintenant, surFermeture, surResolution }: SyncPanelProps) {
  const [lancement, definirLancement] = useState(false);
  const premier = useRef<HTMLButtonElement>(null);
  const fermer = useRef<HTMLButtonElement>(null);
  // Le focus entre dans le panneau, pour qu'il se parcoure au clavier et se ferme par Échap.
  useEffect(() => (premier.current ?? fermer.current)?.focus(), []);

  const synchroniser = (): void => {
    definirLancement(true);
    void api.synchroniserMaintenant().finally(() => definirLancement(false));
  };

  return (
    <div role="dialog" aria-label="Synchronisation avec le NAS" className="bg-surface text-texte absolute bottom-8 left-0 z-40 w-[26rem] max-w-[calc(100vw-1rem)] space-y-3 rounded-lg p-4 text-sm shadow-xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{libelleDeSync(etat, maintenant)}</p>
          {etat.derniereSync !== null && etat.etat !== 'synchronise' && (
            <p className="text-discret text-xs">Dernière synchronisation réussie {momentDeSync(etat.derniereSync, maintenant)}.</p>
          )}
          {etat.etat !== 'desactivee' && <p className="text-discret text-xs">Synchronisation automatique toutes les 5 secondes.</p>}
        </div>
        {etat.etat !== 'desactivee' && (
          <button ref={premier} type="button" onClick={synchroniser} disabled={lancement || etat.etat === 'en_cours'} className={`${classeBouton} flex shrink-0 items-center gap-1.5`}>
            <RefreshCw className={`size-3.5 ${lancement ? 'animate-spin' : ''}`} aria-hidden="true" />
            Synchroniser
          </button>
        )}
      </div>

      {etat.etat === 'desactivee' && (
        <p className="text-discret">
          La connexion au NAS se règle dans les réglages. En attendant, tout reste enregistré sur ce poste.
        </p>
      )}

      {etat.sauvegardes.length > 0 && (
        <section className="space-y-1.5">
          <h2 className="font-medium">Versions en conflit</h2>
          <p className="text-discret text-xs">
            Ces pages ont été modifiées sur deux appareils en même temps. Rien n'a été perdu : la version de l'autre appareil est gardée à côté de la page. « Résoudre » met les deux versions face à face
            pour choisir ce que la page garde.
          </p>
          <ul className="max-h-40 space-y-1 overflow-y-auto">
            {etat.sauvegardes.map((chemin) => (
              <li key={chemin} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-mono text-xs" title={chemin}>
                  {chemin}
                </span>
                {estFichierDeConflitDePage(chemin) && (
                  <button
                    type="button"
                    onClick={() => surResolution(chemin)}
                    className={`${classeBouton} flex shrink-0 items-center gap-1 text-xs`}
                    aria-label={`Résoudre ${chemin}`}
                  >
                    <GitMerge className="size-3.5" aria-hidden="true" />
                    Résoudre
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void api.montrerFichier({ chemin })}
                  className={`${classeBouton} flex shrink-0 items-center gap-1 text-xs`}
                  aria-label={`Montrer ${chemin} dans le dossier`}
                >
                  <FolderOpen className="size-3.5" aria-hidden="true" />
                  Montrer
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {etat.erreurs.length > 0 && (
        <section className="space-y-1">
          <h2 className="font-medium">Pas encore synchronisés</h2>
          <ul className="text-discret max-h-32 space-y-0.5 overflow-y-auto text-xs">
            {etat.erreurs.map(({ chemin, message }) => (
              <li key={chemin}>
                <span className="font-mono">{chemin}</span> : {message}
              </li>
            ))}
          </ul>
        </section>
      )}

      {etat.refuses.length > 0 && (
        <section className="space-y-1">
          <h2 className="font-medium">Jamais envoyés sur le NAS</h2>
          <p className="text-discret text-xs">Leur nom contient un caractère que le NAS refuse (\ : * ? " &lt; &gt; |). Renomme-les pour qu'ils partent.</p>
          <ul className="text-discret max-h-24 space-y-0.5 overflow-y-auto font-mono text-xs">
            {etat.refuses.map((chemin) => (
              <li key={chemin}>{chemin}</li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex justify-end">
        <button ref={fermer} type="button" onClick={surFermeture} className={`${classeBouton} text-xs`}>
          Fermer
        </button>
      </div>
    </div>
  );
}
