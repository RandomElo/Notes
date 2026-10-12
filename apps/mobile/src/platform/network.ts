import { App } from '@capacitor/app';
import { Network } from '@capacitor/network';

/**
 * Ce qui doit relancer une sync (docs/spec/sync.md) : le retour au premier plan et un
 * changement de réseau (wifi retrouvé, passage en 4G). L'application ne pilote
 * pas Tailscale : elle constate seulement si le NAS répond.
 */
export function surOccasionDeSync(rappel: (raison: 'premier-plan' | 'reseau') => void, surArrierePlan: () => void): () => void {
  const abonnements = [
    App.addListener('appStateChange', ({ isActive }) => (isActive ? rappel('premier-plan') : surArrierePlan())),
    Network.addListener('networkStatusChange', ({ connected }) => {
      if (connected) {
        rappel('reseau');
      }
    }),
  ];
  return () => {
    for (const abonnement of abonnements) {
      void abonnement.then((poignee) => poignee.remove());
    }
  };
}

/** Faux quand le téléphone n'a aucun réseau : inutile d'attendre le NAS. */
export async function reseauPresent(): Promise<boolean> {
  try {
    return (await Network.getStatus()).connected;
  } catch {
    return true;
  }
}
