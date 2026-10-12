import { createContext, useContext, useEffect, useRef } from 'react';

/** Les écrans, empilés : Retour revient au précédent. */
export type Ecran = { nom: 'accueil' } | { nom: 'page'; chemin: string } | { nom: 'recherche' } | { nom: 'reglages' } | { nom: 'connexion' };

export interface Navigation {
  ouvrir(ecran: Ecran): void;
  /** Ouvre la page d'identifiant donné (mention, résultat), si elle existe. */
  ouvrirPageParId(id: string): void;
  retour(): void;
  /** Pages dépliées dans l'arborescence de l'accueil, gardées tant que l'application tourne. */
  deplies: ReadonlySet<string>;
  basculer(chemin: string): void;
}

export const NavigationContexte = createContext<Navigation | null>(null);

export function useNavigation(): Navigation {
  const valeur = useContext(NavigationContexte);
  if (valeur === null) {
    throw new Error('useNavigation hors de App.');
  }
  return valeur;
}

/**
 * Pile des fermetures à faire avant de changer d'écran au bouton Retour :
 * la dernière feuille, sommaire ou visionneuse ouvert se ferme d'abord.
 */
const fermetures: (() => void)[] = [];

export function fermerLePlusRecent(): boolean {
  const fermer = fermetures.at(-1);
  if (fermer === undefined) {
    return false;
  }
  fermer();
  return true;
}

/** Tant que `ouvert`, le bouton Retour appelle `fermer` au lieu de changer d'écran. */
export function useFermetureParRetour(ouvert: boolean, fermer: () => void): void {
  const courant = useRef(fermer);
  courant.current = fermer;
  useEffect(() => {
    if (!ouvert) {
      return;
    }
    const appel = (): void => courant.current();
    fermetures.push(appel);
    return () => {
      const rang = fermetures.lastIndexOf(appel);
      if (rang >= 0) {
        fermetures.splice(rang, 1);
      }
    };
  }, [ouvert]);
}
