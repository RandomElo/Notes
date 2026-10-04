import { describe, expect, it } from 'vitest';
import { cadrageInitial, deplacer, rectangleSource, tailleDeLApercu, zoomer } from './crop';

describe('recadrage d’une icône', () => {
  it('prend d’abord le plus grand carré au centre', () => {
    expect(rectangleSource(cadrageInitial(400, 200), 400, 200)).toEqual({ x: 100, y: 0, cote: 200 });
  });

  it('suit la souris sans sortir de l’image', () => {
    const depart = cadrageInitial(400, 200);
    // Glisser d'un aperçu entier vers la droite : on voit ce qui est à gauche, jusqu'au bord.
    expect(rectangleSource(deplacer(depart, tailleDeLApercu / 2, 0, 400, 200), 400, 200)).toEqual({ x: 0, y: 0, cote: 200 });
    expect(rectangleSource(deplacer(depart, -1000, 0, 400, 200), 400, 200)).toEqual({ x: 200, y: 0, cote: 200 });
    // Pas de place en hauteur au zoom 1.
    expect(rectangleSource(deplacer(depart, 0, 500, 400, 200), 400, 200).y).toBe(0);
  });

  it('zoome entre 1 et 4, en restant dans l’image', () => {
    const zoome = zoomer(cadrageInitial(400, 200), 2, 400, 200);
    expect(rectangleSource(zoome, 400, 200)).toEqual({ x: 150, y: 50, cote: 100 });
    expect(zoomer(zoome, 100, 400, 200).zoom).toBe(4);
    expect(zoomer(zoome, 0.01, 400, 200).zoom).toBe(1);
  });
});
