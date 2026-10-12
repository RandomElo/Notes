import { TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../../lib/ipc';

/** Versions en conflit gardées à côté de la page, relues à chaque changement du dossier des notes. */
export function useConflits(chemin: string): string[] {
  const [conflits, definirConflits] = useState<string[]>([]);
  useEffect(() => {
    let actif = true;
    const relire = (): void => {
      void api.listerConflits({ chemin }).then((liste) => actif && definirConflits(liste));
    };
    relire();
    const desabonner = api.surVaultModifie(relire);
    return () => {
      actif = false;
      desabonner();
    };
  }, [chemin]);
  return conflits;
}

interface ConflictNoticeProps {
  conflits: string[];
  /** Ouvre l'écran de résolution pour cette version. */
  surResolution: (sauvegarde: string) => void;
}

/** La page a une version mise de côté : on le dit en tête de page, avec de quoi la résoudre (docs/spec/sync.md). */
export function ConflictNotice({ conflits, surResolution }: ConflictNoticeProps) {
  const premiere = conflits[0];
  if (premiere === undefined) {
    return null;
  }
  return (
    <div role="alert" className="bg-alerte/15 mb-4 flex items-start gap-3 rounded-md p-3 text-sm">
      <TriangleAlert className="text-alerte mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p className="flex-1">
        Cette page a été modifiée ailleurs en même temps qu'ici.{' '}
        {conflits.length === 1 ? "L'autre version est gardée à côté, rien n'est perdu." : `${conflits.length} autres versions sont gardées à côté, rien n'est perdu.`}
      </p>
      <button type="button" onClick={() => surResolution(premiere)} className="bg-texte/10 hover:bg-texte/20 focus-visible:bg-accent/40 shrink-0 rounded px-2 py-1 outline-0">
        Résoudre
      </button>
    </div>
  );
}
