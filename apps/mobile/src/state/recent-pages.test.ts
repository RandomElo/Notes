import type { TreeNode } from '@notes/core';
import { describe, expect, it } from 'vitest';
import { depuisQuand, pagesRecentes } from './recent-pages';

const noeud = (chemin: string, genre: TreeNode['genre'] = 'page', enfants: TreeNode[] = []): TreeNode => ({
  chemin,
  genre,
  importe: true,
  id: chemin,
  titre: chemin,
  icone: null,
  mode: null,
  enfants,
});

describe('pages récentes', () => {
  it('garde les pages modifiées le plus récemment, la plus récente en tête', () => {
    const arbre = [noeud('A', 'page', [noeud('A/B')]), noeud('C'), noeud('D', 'dossier', [noeud('D/E')]), noeud('note.md', 'fichier'), noeud('attente:x')];
    const dates = new Map([['A', 10], ['A/B', 30], ['C', 20], ['D/E', 5], ['note.md', 99]]);
    expect(pagesRecentes(arbre, dates).map((page) => page.noeud.chemin)).toEqual(['A/B', 'C', 'A', 'D/E']);
    expect(pagesRecentes(arbre, dates, 2).map((page) => page.noeud.chemin)).toEqual(['A/B', 'C']);
    expect(pagesRecentes(arbre, dates)[0]!.parents).toEqual(['A']);
  });

  it('dit depuis quand une page a changé', () => {
    const maintenant = new Date(2026, 9, 11, 15, 0).getTime();
    const avant = (minutes: number) => maintenant - minutes * 60_000;
    expect(depuisQuand(avant(0), maintenant)).toBe('à l’instant');
    expect(depuisQuand(avant(5), maintenant)).toBe('il y a 5 min');
    expect(depuisQuand(avant(125), maintenant)).toBe('il y a 2 h');
    expect(depuisQuand(new Date(2026, 9, 10, 9, 0).getTime(), maintenant)).toBe('hier');
    expect(depuisQuand(new Date(2026, 9, 8, 9, 0).getTime(), maintenant)).toBe('il y a 3 jours');
    expect(depuisQuand(new Date(2026, 8, 2).getTime(), maintenant)).toBe('le 2 septembre');
    expect(depuisQuand(new Date(2025, 8, 2).getTime(), maintenant)).toBe('le 2 septembre 2025');
  });
});
