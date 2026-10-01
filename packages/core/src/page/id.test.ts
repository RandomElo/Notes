import { describe, expect, it } from 'vitest';
import { estId, genererId } from './id';

const alea = (graine: number) => Uint8Array.from({ length: 10 }, (_, index) => (graine + index * 17) % 256);

describe('genererId', () => {
  it('produit un UUID v7 valide', () => {
    const id = genererId(Date.UTC(2026, 9, 1), alea(3));
    expect(estId(id)).toBe(true);
    expect(id[14]).toBe('7');
    expect('89ab').toContain(id[19]);
  });

  it("encode l'horodatage en tête, donc se trie par date de création", () => {
    const ancien = genererId(1_700_000_000_000, alea(250));
    const recent = genererId(1_700_000_000_001, alea(0));
    expect(ancien < recent).toBe(true);
    expect(ancien.slice(0, 13).replace('-', '')).toBe((1_700_000_000_000).toString(16).padStart(12, '0'));
  });

  it("refuse un aléa trop court", () => {
    expect(() => genererId(0, new Uint8Array(4))).toThrow();
  });
});

describe('estId', () => {
  it.each(['', 'pas-un-id', '0199A0B0-0000-7000-8000-000000000000', 42, null])('refuse %j', (valeur) => {
    expect(estId(valeur)).toBe(false);
  });
});
