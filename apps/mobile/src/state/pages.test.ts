import type { TreeNode } from '@notes/core';
import { describe, expect, it } from 'vitest';
import { pagesAplaties, trouverAvecParents } from './pages';

const noeud = (chemin: string, enfants: TreeNode[] = [], genre: TreeNode['genre'] = 'page'): TreeNode => ({
  chemin,
  genre,
  importe: genre === 'page',
  id: genre === 'page' ? chemin : null,
  titre: chemin.split('/').at(-1) ?? chemin,
  icone: null,
  mode: null,
  enfants,
});

const arbre = [noeud('Projets', [noeud('Projets/Site'), noeud('Projets/Archives', [noeud('Projets/Archives/2025')], 'dossier')]), noeud('Courses')];

describe('pages de l’arborescence', () => {
  it('liste les pages dans l’ordre, avec leurs ancêtres, sans les simples dossiers', () => {
    expect(pagesAplaties(arbre).map(({ noeud, parents }) => [noeud.chemin, parents])).toEqual([
      ['Projets', []],
      ['Projets/Site', ['Projets']],
      ['Projets/Archives/2025', ['Projets', 'Archives']],
      ['Courses', []],
    ]);
  });

  it('retrouve une page et ses ancêtres, sans confondre deux noms qui commencent pareil', () => {
    const trouve = trouverAvecParents([...arbre, noeud('Projets 2')], 'Projets/Archives/2025');
    expect(trouve?.parents.map((parent) => parent.chemin)).toEqual(['Projets', 'Projets/Archives']);
    expect(trouverAvecParents(arbre, 'Projets 2')).toBeNull();
  });
});
