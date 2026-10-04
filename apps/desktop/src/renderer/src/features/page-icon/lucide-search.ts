import { icons } from 'lucide-react';
import { normaliser } from '../slash-menu/slash-commands';
import { motsFrancais } from './lucide-fr';

/** `BookOpen` devient `book-open`, le nom écrit dans le front-matter. */
function enKebab(nom: string): string {
  return nom
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .replace(/([a-zA-Z])([0-9])/g, '$1-$2')
    .toLowerCase();
}

/** Noms de toutes les icônes Lucide, en kebab-case, dans l'ordre alphabétique. */
export const nomsLucide: string[] = Object.keys(icons).map(enKebab).sort();

/**
 * Icônes qui correspondent à la recherche (README §6) : par un mot français
 * de la table (« maison » trouve `house`), ou directement par le nom anglais.
 * Les correspondances françaises passent devant.
 */
export function chercherIcones(requete: string): string[] {
  const cherche = normaliser(requete).replace(/\s+/g, '-');
  if (cherche === '') {
    return nomsLucide;
  }
  // Mots anglais des mots français qui commencent par la recherche (« mais » trouve « maison »).
  const traductions = Object.entries(motsFrancais)
    .filter(([mot]) => mot.startsWith(cherche))
    .flatMap(([, anglais]) => anglais);
  const commencePar = (nom: string, mot: string): boolean => nom === mot || nom.startsWith(`${mot}-`) || nom.includes(`-${mot}`);
  const enFrancais = nomsLucide.filter((nom) => traductions.some((mot) => commencePar(nom, mot)));
  const parSonNom = nomsLucide.filter((nom) => nom.includes(cherche) && !enFrancais.includes(nom));
  return [...enFrancais, ...parSonNom];
}
