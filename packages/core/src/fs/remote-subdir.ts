import { joindreChemins } from './paths';
import type { RemoteEntry, RemoteFs } from './remote-fs';

/**
 * Vue d'un dossier du partage comme s'il en était la racine : la sync et les
 * verrous travaillent en chemins du vault, ce RemoteFs ajoute le dossier du
 * vault dans le partage (réglage `dossierVault`) devant chaque chemin.
 */
export function sousDossierDistant(distant: RemoteFs, racine: string): RemoteFs {
  if (racine === '') {
    return distant;
  }
  const dans = (chemin: string): string => joindreChemins(racine, chemin);
  return {
    infos: (chemin): Promise<RemoteEntry | null> => distant.infos(dans(chemin)),
    lister: (chemin) => distant.lister(dans(chemin)),
    lire: (chemin) => distant.lire(dans(chemin)),
    ecrire: (chemin, contenu) => distant.ecrire(dans(chemin), contenu),
    creerDossier: (chemin) => distant.creerDossier(dans(chemin)),
    renommer: (chemin, vers) => distant.renommer(dans(chemin), dans(vers)),
    supprimer: (chemin) => distant.supprimer(dans(chemin)),
  };
}
