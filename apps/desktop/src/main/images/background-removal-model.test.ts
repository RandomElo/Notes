import { describe, expect, it } from 'vitest';
import { versMasque, versTenseur } from './background-removal-model';

describe('détourage', () => {
  it('range les pixels en trois plans normalisés', () => {
    const tenseur = versTenseur(new Uint8Array([255, 0, 0, 255]), 1);
    expect(tenseur).toHaveLength(3);
    expect(tenseur[0]).toBeCloseTo((1 - 0.485) / 0.229);
    expect(tenseur[1]).toBeCloseTo((0 - 0.456) / 0.224);
  });

  it('étale la carte du modèle de 0 à 255', () => {
    expect([...versMasque(new Float32Array([0.2, 0.6, 1]))]).toEqual([0, 128, 255]);
    expect([...versMasque(new Float32Array([0.5, 0.5]))]).toEqual([0, 0]);
  });
});
