import type { TreeNode } from '@notes/core';
import { describe, expect, it } from 'vitest';
import { adresseRelative, nomDImageLibre, pagesDuPlan, planDeLArchive } from './archive-plan';

const noeud = (chemin: string, enfants: TreeNode[] = [], genre: TreeNode['genre'] = 'page'): TreeNode => ({
  chemin,
  genre,
  importe: genre === 'page',
  id: null,
  titre: chemin.split('/').pop() ?? chemin,
  icone: null,
  mode: null,
  enfants,
});

describe('planDeLArchive', () => {
  it('met la page à la racine, et à côté de chaque fichier le dossier de ses sous-pages', () => {
    const plan = planDeLArchive(noeud('Notes/Projets', [noeud('Notes/Projets/Refonte', [noeud('Notes/Projets/Refonte/Étape 1')]), noeud('Notes/Projets/Idées')]));
    expect(pagesDuPlan(plan).map((page) => page.fichier)).toEqual(['Projets.html', 'Projets/Refonte.html', 'Projets/Refonte/Étape 1.html', 'Projets/Idées.html']);
  });

  it('départage une note posée seule et une page de même nom, et réserve « assets » à la racine', () => {
    const plan = planDeLArchive(noeud('Projets', [noeud('Projets/x', [noeud('Projets/x/y')]), noeud('Projets/X.md', [], 'fichier')]));
    expect(pagesDuPlan(plan).map((page) => page.fichier)).toEqual(['Projets.html', 'Projets/x.html', 'Projets/x/y.html', 'Projets/X 2.html']);
    expect(planDeLArchive(noeud('Assets', [noeud('Assets/a')])).enfants[0]?.fichier).toBe('Assets 2/a.html');
  });
});

describe('adresseRelative', () => {
  it('remonte puis descend, morceaux encodés', () => {
    expect(adresseRelative('Projets/Refonte.html', 'Projets.html')).toBe('../Projets.html');
    expect(adresseRelative('Projets.html', 'Projets/B c.html')).toBe('Projets/B%20c.html');
    expect(adresseRelative('Projets/Refonte/Étape.html', 'assets/images/a.png')).toBe('../../assets/images/a.png');
    expect(adresseRelative('Projets.html', 'Projets.html')).toBe('Projets.html');
  });
});

describe('nomDImageLibre', () => {
  it('numérote un nom déjà pris, sans tenir compte de la casse', () => {
    const pris = new Set<string>();
    expect(nomDImageLibre('schema.png', pris)).toBe('schema.png');
    expect(nomDImageLibre('Schema.png', pris)).toBe('Schema-2.png');
    expect(nomDImageLibre('icone', pris)).toBe('icone');
  });
});
