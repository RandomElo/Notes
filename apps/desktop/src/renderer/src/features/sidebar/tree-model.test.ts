import type { TreeNode } from '@notes/core';
import { describe, expect, it } from 'vitest';
import { cibleDeDecalage, cibleDeDepot, cleDeNoeud, clesDesAncetres, ligneApresSuppression, lignesVisibles, plageDeSelection, racinesDeSelection, zoneDeDepot } from './tree-model';

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

describe('sélection multiple', () => {
  const lignes = lignesVisibles(arbre, new Set(['id-A']));

  it('prend les pages importées entre l’ancre et la ligne visée, dans les deux sens', () => {
    expect(plageDeSelection(lignes, 'id-A/1', 'id-B')).toEqual(['id-A/1', 'id-A/2', 'id-B']);
    expect(plageDeSelection(lignes, 'id-B', 'id-A/1')).toEqual(['id-A/1', 'id-A/2', 'id-B']);
    expect(plageDeSelection(lignes, 'id-C', 'id-C')).toEqual(['id-C']);
    expect(plageDeSelection(lignes, 'id-C', 'absente')).toEqual([]);
  });

  it('laisse de côté une sous-page dont le parent est aussi sélectionné', () => {
    expect(racinesDeSelection(lignes, new Set(['id-A', 'id-A/2', 'id-C'])).map((noeud) => noeud.chemin)).toEqual(['A', 'C']);
  });

  it('déplace plusieurs pages en comptant la position sans elles', () => {
    expect(cibleDeDepot(arbre, ['A', 'B'], 'C', 'apres')).toEqual({ parent: '', index: 1 });
    expect(cibleDeDepot(arbre, ['B', 'C'], 'A/1', 'avant')).toEqual({ parent: 'A', index: 0 });
    expect(cibleDeDepot(arbre, ['B', 'A'], 'A/1', 'avant')).toBeNull();
    expect(cibleDeDepot(arbre, ['B', 'brut.md'], 'C', 'avant')).toBeNull();
  });

  it('donne le focus à la ligne qui suit les pages supprimées, sinon à celle d’avant', () => {
    const noeud = (chemin: string) => lignes.find((ligne) => ligne.noeud.chemin === chemin)!.noeud;
    expect(ligneApresSuppression(lignes, [noeud('A/2'), noeud('A/1')])).toBe('chemin:A/brut.md');
    expect(ligneApresSuppression(lignes, [noeud('A')])).toBe('id-B');
    expect(ligneApresSuppression(lignes, [noeud('C'), noeud('brut.md')])).toBe('id-B');
  });
});
