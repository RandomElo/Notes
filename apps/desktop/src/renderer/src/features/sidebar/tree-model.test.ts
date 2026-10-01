import type { TreeNode } from '@notes/core';
import { describe, expect, it } from 'vitest';
import { cibleDeDecalage, cibleDeDepot, cleDeNoeud, clesDesAncetres, lignesVisibles, zoneDeDepot } from './tree-model';

const page = (chemin: string, enfants: TreeNode[] = [], importe = true): TreeNode => ({
  chemin,
  genre: importe ? 'page' : 'fichier',
  importe,
  id: importe ? `id-${chemin}` : null,
  titre: chemin.split('/').pop() ?? '',
  icone: null,
  mode: null,
  enfants,
});

// A (A/1, A/2, A/brut non importé), B, C, brut non importé
const arbre: TreeNode[] = [
  page('A', [page('A/1'), page('A/2'), page('A/brut.md', [], false)]),
  page('B'),
  page('C'),
  page('brut.md', [], false),
];

describe('lignesVisibles', () => {
  it('ne montre les enfants que des éléments dépliés', () => {
    expect(lignesVisibles(arbre, new Set()).map((ligne) => ligne.noeud.chemin)).toEqual(['A', 'B', 'C', 'brut.md']);
    const deplie = lignesVisibles(arbre, new Set(['id-A']));
    expect(deplie.map((ligne) => [ligne.noeud.chemin, ligne.profondeur])).toEqual([
      ['A', 0], ['A/1', 1], ['A/2', 1], ['A/brut.md', 1], ['B', 0], ['C', 0], ['brut.md', 0],
    ]);
  });

  it('identifie un élément non importé par son chemin', () => {
    expect(cleDeNoeud(arbre[3]!)).toBe('chemin:brut.md');
    expect(clesDesAncetres(arbre, 'A/1')).toEqual(['id-A']);
  });
});

describe('zoneDeDepot', () => {
  it('découpe la ligne en trois, ou en deux si on ne peut rien y déposer dedans', () => {
    expect([0.1, 0.5, 0.9].map((y) => zoneDeDepot(y, true))).toEqual(['avant', 'dedans', 'apres']);
    expect([0.1, 0.4, 0.6].map((y) => zoneDeDepot(y, false))).toEqual(['avant', 'avant', 'apres']);
  });
});

describe('cibleDeDepot', () => {
  it('réordonne parmi les pages sœurs, la page déplacée ne comptant pas', () => {
    expect(cibleDeDepot(arbre, 'C', 'A', 'avant')).toEqual({ parent: '', index: 0 });
    expect(cibleDeDepot(arbre, 'A', 'C', 'apres')).toEqual({ parent: '', index: 2 });
    expect(cibleDeDepot(arbre, 'A', 'B', 'apres')).toEqual({ parent: '', index: 1 });
    expect(cibleDeDepot(arbre, 'A/2', 'A/1', 'avant')).toEqual({ parent: 'A', index: 0 });
  });

  it('dépose dans une page, en dernière position', () => {
    expect(cibleDeDepot(arbre, 'B', 'A', 'dedans')).toEqual({ parent: 'A', index: 2 });
    expect(cibleDeDepot(arbre, 'A/1', 'B', 'dedans')).toEqual({ parent: 'B', index: 0 });
  });

  it('range après les pages un dépôt fait à côté d’un élément non importé', () => {
    expect(cibleDeDepot(arbre, 'A', 'brut.md', 'avant')).toEqual({ parent: '', index: 2 });
  });

  it('refuse les dépôts sans sens', () => {
    expect(cibleDeDepot(arbre, 'A', 'A', 'dedans')).toBeNull();
    expect(cibleDeDepot(arbre, 'A', 'A/1', 'apres')).toBeNull();
    expect(cibleDeDepot(arbre, 'B', 'brut.md', 'dedans')).toBeNull();
    expect(cibleDeDepot(arbre, 'brut.md', 'A', 'dedans')).toBeNull();
    expect(cibleDeDepot(arbre, 'B', 'absent', 'avant')).toBeNull();
  });
});

describe('cibleDeDecalage', () => {
  it('décale d’un cran et s’arrête aux bords', () => {
    expect(cibleDeDecalage(arbre, 'B', -1)).toEqual({ parent: '', index: 0 });
    expect(cibleDeDecalage(arbre, 'B', 1)).toEqual({ parent: '', index: 2 });
    expect(cibleDeDecalage(arbre, 'A', -1)).toBeNull();
    expect(cibleDeDecalage(arbre, 'C', 1)).toBeNull();
    expect(cibleDeDecalage(arbre, 'A/2', -1)).toEqual({ parent: 'A', index: 0 });
  });
});
