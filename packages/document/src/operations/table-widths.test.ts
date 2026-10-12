import { describe, expect, it } from 'vitest';
import { ecrireMarkdown, lireMarkdown } from '../index';
import { avecLargeursDesTableaux, deplacerBordure, largeursDesTableaux, largeursEgales } from './table-widths';

const texte = '| a | b |\n| - | - |\n| 1 | 2 |\n\nEntre.\n\n| x | y | z |\n| - | - | - |\n';

describe('largeur des colonnes', () => {
  it('pose les largeurs de l’en-tête sur les tableaux, dans l’ordre, et les relit', () => {
    const { document, source } = lireMarkdown(texte);
    expect(largeursDesTableaux(document)).toEqual([]);
    const avec = avecLargeursDesTableaux(document, [[30, 70], [20, 30, 50]]);
    expect(largeursDesTableaux(avec)).toEqual([[30, 70], [20, 30, 50]]);
    // Le Markdown ne change pas : les largeurs ne vont que dans l'en-tête.
    expect(ecrireMarkdown(avec, source)).toBe(texte);
  });

  it('ignore une liste qui n’a pas le nombre de colonnes du tableau', () => {
    const { document } = lireMarkdown(texte);
    expect(largeursDesTableaux(avecLargeursDesTableaux(document, [[], [50, 50]]))).toEqual([]);
    expect(largeursDesTableaux(avecLargeursDesTableaux(document, [[40, 60]]))).toEqual([[40, 60]]);
  });

  it('déplace une bordure entre deux colonnes seulement, sans descendre sous 5 %', () => {
    expect(deplacerBordure([30, 30, 40], 0, 10)).toEqual([40, 20, 40]);
    expect(deplacerBordure([30, 30, 40], 1, -40)).toEqual([30, 5, 65]);
    expect(deplacerBordure([30, 70], 1, 10)).toEqual([30, 70]);
  });

  it('répartit des colonnes égales sur 100', () => {
    expect(largeursEgales(3)).toEqual([34, 33, 33]);
    expect(largeursEgales(4)).toEqual([25, 25, 25, 25]);
  });
});
