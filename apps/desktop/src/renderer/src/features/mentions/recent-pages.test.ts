import { describe, expect, it } from 'vitest';
import { ajouterRecente, maxRecentes } from './recent-pages';

describe('ajouterRecente', () => {
  it('met la page en tête sans doublon', () => {
    expect(ajouterRecente(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c']);
    expect(ajouterRecente([], 'a')).toEqual(['a']);
  });

  it('oublie les plus anciennes au-delà du maximum', () => {
    const pleine = Array.from({ length: maxRecentes }, (_, rang) => `p${rang}`);
    const suivante = ajouterRecente(pleine, 'neuve');
    expect(suivante).toHaveLength(maxRecentes);
    expect(suivante[0]).toBe('neuve');
    expect(suivante).not.toContain(`p${maxRecentes - 1}`);
  });
});
