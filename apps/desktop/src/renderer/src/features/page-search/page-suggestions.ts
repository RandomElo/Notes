import { maxRecentes } from '../mentions/recent-pages';

/** Nombre d'ouvertures de chaque page (par sa clé), gardé d'un lancement à l'autre. */
export type OpenCounts = Record<string, number>;

/** Pages comptées au plus : au-delà, celles qu'on ouvre le moins sont oubliées. */
export const maxPagesComptees = 200;

export const estCompteDOuvertures = (valeur: unknown): valeur is OpenCounts =>
  typeof valeur === 'object' &&
  valeur !== null &&
  !Array.isArray(valeur) &&
  Object.values(valeur).every((nombre) => typeof nombre === 'number' && Number.isFinite(nombre) && nombre > 0);

/** Une ouverture de plus pour cette page. */
export function compterOuverture(comptes: OpenCounts, cle: string): OpenCounts {
  const suivants = { ...comptes, [cle]: (comptes[cle] ?? 0) + 1 };
  const cles = Object.keys(suivants);
  if (cles.length <= maxPagesComptees) {
    return suivants;
  }
  // La page qu'on vient d'ouvrir reste, même si elle n'a qu'une ouverture.
  const oubliee = cles.filter((autre) => autre !== cle).reduce((moins, autre) => ((suivants[autre] ?? 0) < (suivants[moins] ?? 0) ? autre : moins));
  delete suivants[oubliee];
  return suivants;
}

/**
 * Pages proposées par la recherche de pages avant toute saisie (docs/spec/interface.md) :
 * un mélange des plus récentes et des plus ouvertes. Une page ouverte il y a peu passe
 * devant une page souvent ouverte autrefois, mais une page ouverte chaque jour reste en haut.
 */
export function suggestions(recentes: readonly string[], comptes: OpenCounts, existe: (cle: string) => boolean, nombre: number): string[] {
  const score = (cle: string): number => {
    const rang = recentes.indexOf(cle);
    const recence = rang < 0 ? 0 : (maxRecentes - rang) / 4;
    return Math.log2(1 + (comptes[cle] ?? 0)) + recence;
  };
  const cles = [...new Set([...recentes, ...Object.keys(comptes)])].filter(existe);
  return cles
    .map((cle) => ({ cle, score: score(cle) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, nombre)
    .map(({ cle }) => cle);
}
