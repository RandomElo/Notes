import { watch } from 'node:fs';

/**
 * Surveille le dossier du vault et prévient quand quelque chose y change, que
 * ce soit l'application ou un autre outil. Les rafales d'événements sont
 * regroupées. Renvoie la fonction qui arrête la surveillance.
 */
export function surveillerVault(racine: string, surChangement: () => void, delaiMs = 250): () => void {
  let minuteur: NodeJS.Timeout | null = null;
  const declencher = (): void => {
    if (minuteur !== null) {
      clearTimeout(minuteur);
    }
    minuteur = setTimeout(() => {
      minuteur = null;
      surChangement();
    }, delaiMs);
  };

  let surveillant: ReturnType<typeof watch> | null = null;
  try {
    surveillant = watch(racine, { recursive: true }, declencher);
    // Une erreur de surveillance (dossier supprimé) ne doit pas faire tomber l'application.
    surveillant.on('error', () => undefined);
  } catch {
    // Dossier absent ou surveillance impossible : l'arbre reste à jour pour les actions faites dans l'application.
  }

  return () => {
    if (minuteur !== null) {
      clearTimeout(minuteur);
    }
    surveillant?.close();
  };
}
