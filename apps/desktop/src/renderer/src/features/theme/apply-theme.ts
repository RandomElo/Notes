/** Ce qu'il faut d'un élément pour y poser des variables CSS : son `style`. Permet de tester sans navigateur. */
export interface StyleTarget {
  style: { setProperty(nom: string, valeur: string): void; removeProperty(nom: string): void };
}

/**
 * Pose des variables CSS sur un élément et retire celles de la fois d'avant
 * qui n'y sont plus. Rend la liste des variables posées, à repasser la fois
 * suivante.
 */
export function poserVariables(cible: StyleTarget, variables: Record<string, string>, precedentes: readonly string[] = []): string[] {
  for (const nom of precedentes) {
    if (!(nom in variables)) {
      cible.style.removeProperty(nom);
    }
  }
  for (const [nom, valeur] of Object.entries(variables)) {
    cible.style.setProperty(nom, valeur);
  }
  return Object.keys(variables);
}
