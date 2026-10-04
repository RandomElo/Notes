import type { TreeNode } from '@notes/core';
import { describe, expect, it, vi } from 'vitest';
import { PagesIndex } from './pages-directory';

const page = (id: string, titre: string, enfants: TreeNode[] = []): TreeNode => ({
  chemin: titre,
  genre: 'page',
  importe: true,
  id,
  titre,
  icone: null,
  mode: null,
  enfants,
});

describe('annuaire des pages', () => {
  it('garde le même objet pour une page qui ne change pas, et ne prévient que s’il y a un changement', () => {
    const annuaire = new PagesIndex();
    const ecouteur = vi.fn();
    annuaire.abonner(ecouteur);
    annuaire.definirArbre([page('A', 'Alpha', [page('B', 'Bêta')])]);
    expect(ecouteur).toHaveBeenCalledTimes(1);
    const alpha = annuaire.lire('a');
    annuaire.definirArbre([page('A', 'Alpha', [page('B', 'Bêta 2')])]);
    expect(ecouteur).toHaveBeenCalledTimes(2);
    expect(annuaire.lire('A')).toBe(alpha);
    expect(annuaire.lire('B')?.titre).toBe('Bêta 2');
    annuaire.definirArbre([page('A', 'Alpha', [page('B', 'Bêta 2')])]);
    expect(ecouteur).toHaveBeenCalledTimes(2);
    expect(annuaire.lire('Z')).toBeNull();
  });
});
