import type { TreeNode } from '@notes/core';
import { describe, expect, it } from 'vitest';
import { imagesAEmporter, versDataUri } from './export-images';

const id = '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const noeud: TreeNode = { chemin: 'Projets', genre: 'page', importe: true, id: null, titre: 'Projets', icone: 'assets/icone.webp', mode: null, enfants: [] };
const pages = (cle: string) => (cle === id ? { titre: 'Autre', icone: 'assets/icone-2.webp', chemin: 'Autre' } : null);
const corps = `![a](assets/a.webp#largeur=50)\n\nVoir [Autre](notes://${id}) et [Site](https://exemple.fr/x "mention").\n\n![loin](https://exemple.fr/b.png)\n`;

describe('imagesAEmporter', () => {
  it('rassemble les images de la page, les icônes et les favicons', () => {
    expect(imagesAEmporter(corps, noeud, 'Projets', true, pages)).toEqual([
      'Projets/assets/icone.webp',
      'Projets/assets/a.webp',
      'Autre/assets/icone-2.webp',
      '.notes/favicons/exemple.fr.png',
    ]);
  });

  it('sans les icônes, seulement les images du contenu', () => {
    expect(imagesAEmporter(corps, noeud, 'Projets', false, pages)).toEqual(['Projets/assets/a.webp']);
  });
});

describe('versDataUri', () => {
  it('encode en base64, même une grande image', () => {
    expect(versDataUri(new Uint8Array([104, 105]), 'image/png')).toBe('data:image/png;base64,aGk=');
    const grande = new Uint8Array(200_000).fill(65);
    expect(atob(versDataUri(grande, 'image/webp').split(',')[1] as string)).toHaveLength(200_000);
  });
});
