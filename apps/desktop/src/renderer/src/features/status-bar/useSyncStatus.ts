import { useEffect, useState } from 'react';
import { api } from '../../lib/ipc';
import type { SyncStatus } from '../../../../shared/ipc-contract';

/** État de la sync tenu par le main : lu au démarrage, puis suivi à chaque changement. */
export function useSyncStatus(): SyncStatus | null {
  const [etat, definirEtat] = useState<SyncStatus | null>(null);
  useEffect(() => {
    let actif = true;
    void api.lireEtatSync().then((lu) => actif && definirEtat((actuel) => actuel ?? lu));
    const desabonner = api.surEtatSync(definirEtat);
    return () => {
      actif = false;
      desabonner();
    };
  }, []);
  return etat;
}
