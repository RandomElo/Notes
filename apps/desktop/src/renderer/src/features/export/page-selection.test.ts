import type { TreeNode } from '@notes/core';
import { describe, expect, it } from 'vitest';
import { basculerPage, pagesGardees } from './page-selection';

const noeud = (chemin: string, enfants: TreeNode[] = []): TreeNode => ({ chemin, genre: 'page', importe: true, id: null, titre: chemin, icone: null, mode: null, enfants });
const c = noeud('A/B/C');
const b = noeud('A/B', [c]);
const racine = noeud('A', [b, noeud('A/D')]);

describe('basculerPage', () => {
  it('décoche une page avec ses sous-pages, puis recoche une sous-page seule', () => {
    const sansB = basculerPage(new Set(), b, false);
    expect([...sansB].sort()).toEqual(['A/B', 'A/B/C']);
    expect(pagesGardees(racine, sansB)).toBe(2);
    const avecC = basculerPage(sansB, c, true);
    expect([...avecC]).toEqual(['A/B']);
    expect(pagesGardees(racine, avecC)).toBe(3);
  });
});
