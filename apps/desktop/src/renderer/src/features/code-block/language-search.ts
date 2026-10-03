import type { LanguageInfo } from '@notes/ui';
import { normaliser } from '../slash-menu/slash-commands';

/**
 * Les langages qui correspondent à la recherche, sans accents ni casse : par
 * leur nom, leur identifiant ou un alias. Ceux dont un nom commence par la
 * recherche viennent d'abord.
 */
export function filtrerLangages(langages: readonly LanguageInfo[], requete: string): LanguageInfo[] {
  const cherche = normaliser(requete);
  if (cherche === '') {
    return [...langages];
  }
  const debut: LanguageInfo[] = [];
  const dedans: LanguageInfo[] = [];
  for (const langage of langages) {
    const noms = [langage.nom, langage.id, ...langage.alias].map(normaliser);
    if (noms.some((nom) => nom.startsWith(cherche))) {
      debut.push(langage);
    } else if (noms.some((nom) => nom.includes(cherche))) {
      dedans.push(langage);
    }
  }
  // Un nom exact passe devant : « c » donne C avant C#, CSS...
  debut.sort((a, b) => Number([b.nom, b.id, ...b.alias].map(normaliser).includes(cherche)) - Number([a.nom, a.id, ...a.alias].map(normaliser).includes(cherche)));
  return [...debut, ...dedans];
}
