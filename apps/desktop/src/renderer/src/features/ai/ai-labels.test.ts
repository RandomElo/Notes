import { describe, expect, it } from 'vitest';
import { libelleDeTempsRestant, tempsRestantDeLIa } from './ai-labels';

describe('temps restant', () => {
  it('dit le temps restant simplement', () => {
    expect(libelleDeTempsRestant(30_000)).toBe('environ 30 s restantes');
    expect(libelleDeTempsRestant(150_000)).toBe('environ 2 min 30 s restantes');
    expect(libelleDeTempsRestant(1500)).toBe('presque fini');
  });

  it('suit l’estimation au début, puis la vitesse réelle de l’appel', () => {
    expect(tempsRestantDeLIa(40_000, 10_000, 0, 400)).toBe(30_000);
    expect(tempsRestantDeLIa(40_000, 50_000, 40, 400)).toBe(0);
    // La moitié reçue en 30 s : encore 30 s, quoi qu'en disait l'estimation.
    expect(tempsRestantDeLIa(40_000, 30_000, 200, 400)).toBe(30_000);
    expect(tempsRestantDeLIa(40_000, 30_000, 500, 400)).toBe(0);
  });
});
