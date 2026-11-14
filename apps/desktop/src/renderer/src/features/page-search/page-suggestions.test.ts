import { describe, expect, it } from 'vitest';
import { compterOuverture, estCompteDOuvertures, maxPagesComptees, suggestions } from './page-suggestions';

const toutes = (): boolean => true;

describe('compterOuverture', () => {
  it('ajoute une ouverture', () => {
    expect(compterOuverture({}, 'a')).toEqual({ a: 1 });
    expect(compterOuverture({ a: 2 }, 'a')).toEqual({ a: 3 });
  });

  it('oublie la page la moins ouverte au-delà du plafond, jamais celle qu’on ouvre', () => {
    const comptes = Object.fromEntries(Array.from({ length: maxPagesComptees }, (_, rang) => [`p${rang}`, rang === 7 ? 1 : 5]));
    const suivants = compterOuverture(comptes, 'nouvelle');
    expect(Object.keys(suivants)).toHaveLength(maxPagesComptees);
    expect(suivants['nouvelle']).toBe(1);
    expect(suivants['p7']).toBeUndefined();
  });
});

describe('suggestions', () => {
  it('mélange les récentes et les plus ouvertes', () => {
    // « souvent » n'est plus récente, mais a été ouverte 60 fois ; « hier » est la deuxième récente.
    const resultat = suggestions(['maintenant', 'hier', 'avant'], { souvent: 60, maintenant: 1, hier: 1, avant: 1 }, toutes, 3);
    expect(resultat).toEqual(['maintenant', 'souvent', 'hier']);
  });

  it('une page souvent ouverte et récente passe en tête', () => {
    expect(suggestions(['a', 'b'], { a: 1, b: 30 }, toutes, 2)).toEqual(['b', 'a']);
  });

  it('écarte les pages qui n’existent plus', () => {
    expect(suggestions(['a', 'b'], { c: 4 }, (cle) => cle !== 'b', 5)).toEqual(['a', 'c']);
  });
});

describe('estCompteDOuvertures', () => {
  it('lit un état gardé, refuse le reste', () => {
    expect(estCompteDOuvertures({ a: 2 })).toBe(true);
    expect(estCompteDOuvertures({ a: 'deux' })).toBe(false);
    expect(estCompteDOuvertures(['a'])).toBe(false);
    expect(estCompteDOuvertures(null)).toBe(false);
  });
});
