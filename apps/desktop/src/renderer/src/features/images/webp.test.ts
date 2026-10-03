import { describe, expect, it } from 'vitest';
import { dimensionsReduites } from './webp';

describe('réduction d’une image', () => {
  it('ramène la largeur à 1920 px en gardant les proportions, sans jamais agrandir', () => {
    expect(dimensionsReduites(3840, 2160)).toEqual({ largeur: 1920, hauteur: 1080 });
    expect(dimensionsReduites(4000, 3)).toEqual({ largeur: 1920, hauteur: 1 });
    expect(dimensionsReduites(800, 600)).toEqual({ largeur: 800, hauteur: 600 });
    expect(dimensionsReduites(1920, 5000)).toEqual({ largeur: 1920, hauteur: 5000 });
  });
});
