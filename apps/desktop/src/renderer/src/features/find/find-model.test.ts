import { lireMarkdown } from '@notes/document';
import { describe, expect, it } from 'vitest';
import { chercherDansLaPage } from './find-model';

const textes = (corps: string, requete: string): string[] => {
  const { document } = lireMarkdown(corps);
  return chercherDansLaPage(document, requete).map(({ from, to }) => document.textBetween(from, to));
};

describe('recherche dans la page', () => {
  it('trouve sans tenir compte des accents ni de la casse, dans l’ordre de lecture', () => {
    expect(textes('Été à **Évian**\n\n- les étés\n', 'ete')).toEqual(['Été', 'été']);
    expect(textes('Évian\n', 'EVIAN')).toEqual(['Évian']);
  });

  it('trouve plusieurs fois dans un même bloc, à travers la mise en forme', () => {
    expect(textes('abc **ab**c abc\n', 'abc')).toEqual(['abc', 'abc', 'abc']);
  });

  it('ne cherche rien pour une requête vide et ne déborde pas d’un bloc', () => {
    expect(textes('a\n\nb\n', '')).toEqual([]);
    expect(textes('fin\n\ndébut\n', 'find')).toEqual([]);
  });
});
