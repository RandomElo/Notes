import { describe, expect, it } from 'vitest';
import { lireCsv } from './csv';

describe('lireCsv', () => {
  it('lit les valeurs entre guillemets, les guillemets doublés, les sauts de ligne et le BOM', () => {
    expect(lireCsv('﻿Nom,Détails\r\nPong,"Faire, puis ""tester"""\n"Deux\nlignes",\n\n')).toEqual([
      ['Nom', 'Détails'],
      ['Pong', 'Faire, puis "tester"'],
      ['Deux\nlignes', ''],
    ]);
  });

  it('rend une liste vide pour un fichier vide', () => {
    expect(lireCsv('')).toEqual([]);
  });
});
