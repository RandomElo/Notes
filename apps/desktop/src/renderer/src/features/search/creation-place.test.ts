import type { TreeNode } from '@notes/core';
import { describe, expect, it } from 'vitest';
import { demandeDeCreation, emplacementsProposes, libelleDeCreation } from './creation-place';

const page = (chemin: string, enfants: TreeNode[] = [], importe = true): TreeNode =>
  ({ id: importe ? chemin : null, titre: chemin.split('/').at(-1) ?? '', chemin, importe, genre: 'page', enfants }) as unknown as TreeNode;

const projet = page('Projets/Site');
const arbre = [page('Courses'), page('Externe', [], false), page('Projets', [page('Projets/NAS'), projet]), page('Journal')];

describe('emplacementsProposes', () => {
  it('après la page ouverte d’abord, puis dedans, puis la racine', () => {
    expect(emplacementsProposes(projet)).toEqual(['apres', 'dans', 'racine']);
  });

  it('sans page ouverte, ou pour un élément pas importé, seulement la racine', () => {
    expect(emplacementsProposes(null)).toEqual(['racine']);
    expect(emplacementsProposes(page('Externe', [], false))).toEqual(['racine']);
  });
});

describe('demandeDeCreation', () => {
  it('après : même dossier, juste après la page ouverte', () => {
    expect(demandeDeCreation(arbre, projet, 'apres')).toEqual({ parent: 'Projets', index: 2 });
    // À la racine, les éléments pas importés ne comptent pas.
    expect(demandeDeCreation(arbre, arbre[2] ?? null, 'apres')).toEqual({ parent: '', index: 2 });
  });

  it('dans : sous-page de la page ouverte, à la fin', () => {
    expect(demandeDeCreation(arbre, projet, 'dans')).toEqual({ parent: 'Projets/Site' });
  });

  it('racine, ou pas de page ouverte : à la fin de la racine', () => {
    expect(demandeDeCreation(arbre, projet, 'racine')).toEqual({ parent: '' });
    expect(demandeDeCreation(arbre, null, 'apres')).toEqual({ parent: '' });
  });
});

describe('libelleDeCreation', () => {
  it('nomme la page ouverte', () => {
    expect(libelleDeCreation('Idées', 'apres', projet)).toBe('Créer « Idées » après « Site »');
    expect(libelleDeCreation('Idées', 'dans', projet)).toBe('Créer « Idées » dans « Site »');
    expect(libelleDeCreation('Idées', 'racine', null)).toBe('Créer « Idées » à la racine');
  });
});
