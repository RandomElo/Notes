import { describe, expect, it } from 'vitest';
import { libelleDEcart, libelleDeDuree, libelleDeTokens } from './ai-labels';
import { comparerMots, comparerTextes, replier, resumer } from './diff-model';

describe('comparaison avant/après', () => {
  it('aligne les lignes et marque les mots changés', () => {
    const lignes = comparerTextes('Titre\n\nUn texte a relire.\nFin.\n', 'Titre\n\nUn texte à relire.\nNouvelle ligne.\nFin.\n');
    expect(lignes.map((ligne) => ligne.genre)).toEqual(['egal', 'egal', 'modifie', 'ajoute', 'egal']);
    expect(lignes[2]!.avant!.filter((s) => s.change).map((s) => s.texte)).toEqual(['a']);
    expect(lignes[2]!.apres!.filter((s) => s.change).map((s) => s.texte)).toEqual(['à']);
    expect(resumer(lignes)).toEqual({ modifie: 1, retire: 0, ajoute: 1 });
  });

  it('rend une ligne retirée sans vis-à-vis', () => {
    expect(comparerTextes('a\nb\nc\n', 'a\nc\n').map((ligne) => [ligne.genre, ligne.apres])).toEqual([
      ['egal', [{ texte: 'a', change: false }]],
      ['retire', null],
      ['egal', [{ texte: 'c', change: false }]],
    ]);
  });

  it('garde les espaces dans les segments', () => {
    expect(comparerMots('un deux', 'un trois').apres.map((s) => s.texte).join('')).toBe('un trois');
  });

  it('replie les longues suites identiques, avec du contexte', () => {
    const avant = Array.from({ length: 20 }, (_, i) => `ligne ${i}`).join('\n');
    const apres = avant.replace('ligne 10', 'ligne dix');
    const montrees = replier(comparerTextes(avant, apres));
    expect(montrees.map((ligne) => (ligne.genre === 'replie' ? `…${ligne.nombre}` : ligne.ligne.genre))).toEqual(['…8', 'egal', 'egal', 'modifie', 'egal', 'egal', '…7']);
  });
});

describe('libellés', () => {
  it('écrit les tokens, durées et écarts en français', () => {
    expect(libelleDeTokens(1240)).toBe('1 240 tokens');
    expect(libelleDeTokens(1)).toBe('1 token');
    expect(libelleDeDuree(12_300)).toBe('environ 12 s');
    expect(libelleDeDuree(150_000)).toBe('environ 2 min 30 s');
    expect(libelleDEcart(104, 100)).toBe('+4 %');
    expect(libelleDEcart(88, 100)).toBe('−12 %');
    expect(libelleDEcart(100, 100)).toBe('exact');
  });
});
