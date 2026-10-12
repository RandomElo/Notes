import type { TreeNode } from '@notes/core';
import { describe, expect, it } from 'vitest';
import { avecPagesEnAttente, cheminEnAttente, estEnAttente, lirePagesEnAttente } from './pending-pages';

const page = (chemin: string, enfants: TreeNode[] = []): TreeNode => ({ chemin, genre: 'page', importe: true, id: chemin, titre: chemin, icone: null, mode: null, enfants });
const attente = (cle: string, parent: string) => ({ cle, parent, titre: `Titre ${cle}`, modeListe: false, creeLe: 1, corps: '' });

describe('pages créées sans NAS', () => {
  it('relit ce qui a été écrit et oublie ce qui est abîmé', () => {
    const bonne = { cle: '0199a0b0-0000-7000-8000-00000000000a', parent: 'Maison', titre: 'Bricolage', modeListe: true, creeLe: 5, corps: '- [ ] Vis\n' };
    expect(lirePagesEnAttente(JSON.stringify([bonne, { cle: 'x' }, { ...bonne, parent: '../x' }, { ...bonne, titre: '' }]))).toEqual([bonne]);
    // Écrite par une version d'avant, sans contenu.
    const ancienne: Record<string, unknown> = { ...bonne };
    delete ancienne['corps'];
    expect(lirePagesEnAttente(JSON.stringify([ancienne]))).toEqual([{ ...bonne, corps: '' }]);
    expect(lirePagesEnAttente('pas du json')).toEqual([]);
    expect(lirePagesEnAttente(null)).toEqual([]);
  });

  it('se placent en dernier sous leur parent, ou à la racine si le parent a disparu', () => {
    const arbre = [page('Maison', [page('Maison/Cuisine')]), page('Travail')];
    const resultat = avecPagesEnAttente(arbre, [attente('aaaaaaaa', 'Maison'), attente('bbbbbbbb', ''), attente('cccccccc', 'Parti')]);
    expect(resultat.map((noeud) => noeud.chemin)).toEqual(['Maison', 'Travail', cheminEnAttente('bbbbbbbb'), cheminEnAttente('cccccccc')]);
    expect(resultat[0]!.enfants.map((noeud) => noeud.chemin)).toEqual(['Maison/Cuisine', cheminEnAttente('aaaaaaaa')]);
    expect(resultat[1]).toBe(arbre[1]);
  });

  it('se reconnaissent à leur chemin', () => {
    expect(estEnAttente(cheminEnAttente('aaaaaaaa'))).toBe(true);
    expect(estEnAttente('Maison')).toBe(false);
  });
});
