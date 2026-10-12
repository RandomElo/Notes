import type { TreeNode } from '@notes/core';
import { describe, expect, it } from 'vitest';
import { ecrireCopie, lireCopie } from './tree-snapshot';

const arbre: TreeNode[] = [{ chemin: 'A', genre: 'page', importe: true, id: 'a', titre: 'A', icone: '📘', mode: null, enfants: [] }];

describe('copie de l’arborescence', () => {
  it('se relit pour le même NAS', () => {
    expect(lireCopie(ecrireCopie('nas', { arbre, theme: '[couleurs]\n' }), 'nas')).toEqual({ arbre, theme: '[couleurs]\n' });
  });

  it('est ignorée pour un autre NAS, abîmée ou absente', () => {
    expect(lireCopie(ecrireCopie('nas', { arbre, theme: null }), 'autre')).toBeNull();
    expect(lireCopie('{"version":1,"cle":"nas","arbre":[{"chemin":3}],"theme":null}', 'nas')).toBeNull();
    expect(lireCopie('pas du json', 'nas')).toBeNull();
    expect(lireCopie(null, 'nas')).toBeNull();
  });
});
