/**
 * Lancement avec `--recherche` : seule la petite fenêtre de recherche
 * s'affiche (search-window.ts). Le raccourci global est d'habitude capté par
 * l'application gardée en fond ; cet argument sert quand elle ne tourne pas,
 * ou depuis un raccourci du bureau.
 */
export const argumentDeRecherche = '--recherche';

/** Vrai si la ligne de commande demande la recherche. Rien d'autre n'y est lu. */
export function demandeLaRecherche(argv: readonly string[]): boolean {
  return argv.includes(argumentDeRecherche);
}

/**
 * Demande en attente du renderer de la fenêtre principale. Le main la note
 * puis prévient la page ; la page la prend au démarrage et à chaque avis, si
 * bien qu'une demande arrivée avant son chargement n'est pas perdue.
 */
export class PendingRequest<T> {
  private enAttente: T | null = null;

  constructor(private readonly prevenir: () => void) {}

  demander(valeur: T): void {
    this.enAttente = valeur;
    this.prevenir();
  }

  /** Rend la demande une seule fois, null s'il n'y en a pas. */
  prendre(): T | null {
    const demande = this.enAttente;
    this.enAttente = null;
    return demande;
  }
}
