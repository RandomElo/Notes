import { describe, expect, it } from 'vitest';
import { fleches } from './arrows';

const remplacer = (texte: string): string => fleches.reduce((suite, { motif, fleche }) => suite.replace(motif, fleche), texte);

describe('flèches à la saisie', () => {
  it('-> et <- deviennent des flèches à la fin de la saisie', () => {
    expect(remplacer('a ->')).toBe('a →');
    expect(remplacer('b <-')).toBe('b ←');
  });

  it('les flèches avec un égal restent telles quelles', () => {
    expect(remplacer('a =>')).toBe('a =>');
    expect(remplacer('a <=')).toBe('a <=');
    expect(remplacer('a -> b')).toBe('a -> b');
  });
});
