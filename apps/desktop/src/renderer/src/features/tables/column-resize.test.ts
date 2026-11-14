import { describe, expect, it } from 'vitest';
import { largeursApresChangement } from './column-resize';

describe('largeurs après un changement de colonnes', () => {
  it('donne une part égale à la colonne ajoutée, serre les autres, total 100', () => {
    const resultat = largeursApresChangement([17, 17, 24, 13, 13, 16], 7)!;
    expect(resultat).toHaveLength(7);
    expect(resultat.reduce((somme, largeur) => somme + largeur, 0)).toBe(100);
    expect(resultat[6]).toBe(14);
    expect(resultat[2]! > resultat[3]!).toBe(true);
  });

  it('revient à des colonnes égales quand une colonne est retirée', () => {
    expect(largeursApresChangement([50, 25, 25], 2)).toBeNull();
  });
});
