/** Nombre de pages récentes gardées d'un lancement à l'autre. */
export const maxRecentes = 20;

/** La page ouverte passe en tête des récentes, sans doublon. */
export function ajouterRecente(recentes: readonly string[], cle: string): string[] {
  return [cle, ...recentes.filter((autre) => autre !== cle)].slice(0, maxRecentes);
}
