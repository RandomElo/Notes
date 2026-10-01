import { cp, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lireArbre } from '@notes/core';
import type { TreeNode } from '@notes/core';
import { describe, expect, it } from 'vitest';
import { NodeLocalFs } from './node-local-fs';

const vaultDemo = join(import.meta.dirname, '../../../../../fixtures/vault-demo');

const titres = (arbre: TreeNode[]): unknown[] =>
  arbre.map((noeud) => (noeud.enfants.length === 0 ? noeud.titre : [noeud.titre, titres(noeud.enfants)]));

describe('vault d’exemple lu sur le disque', () => {
  it('donne l’arborescence attendue, ordre manuel et note externe compris', async () => {
    const arbre = await lireArbre(new NodeLocalFs(vaultDemo));
    expect(titres(arbre)).toEqual([
      'Bienvenue',
      ['Projets', ['Site perso', 'Refonte du NAS']],
      'Courses',
      ['Journal', [['2026', ['Octobre']]]],
      'Note externe',
    ]);
    expect(arbre[0]).toMatchObject({ icone: '👋', importe: true });
    expect(arbre[2]).toMatchObject({ mode: 'todo' });
    expect(arbre[4]).toMatchObject({ genre: 'fichier', importe: false, id: null });
    // « title: 2026 » sans guillemets : c'est bien un titre, pas un nombre.
    expect(arbre[3]?.enfants[0]).toMatchObject({ titre: '2026', importe: true });
  });

  it('se lit sans modifier un seul fichier', async () => {
    const copie = join(await mkdtemp(join(tmpdir(), 'notes-demo-')), 'vault');
    await cp(vaultDemo, copie, { recursive: true });
    await lireArbre(new NodeLocalFs(copie));
    for (const fichier of ['Bienvenue/page.md', '.order', 'Projets/.order', 'Note externe.md']) {
      expect(await readFile(join(copie, fichier), 'utf8')).toBe(await readFile(join(vaultDemo, fichier), 'utf8'));
    }
  });
});
