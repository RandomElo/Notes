import { describe, expect, it } from 'vitest';
import { Transform } from '@tiptap/pm/transform';
import { ecrireMarkdown, lireMarkdown } from '../index';

describe('tableau', () => {
  it('ne réécrit que le tableau modifié, en colonnes alignées', () => {
    const texte = 'Avant.\n\n|a|b|\n|-|:-:|\n|1|2|\n\nAprès.\n';
    const { document, source } = lireMarkdown(texte);
    // Le texte de la cellule « 1 » devient « un | deux ».
    let position = -1;
    document.descendants((noeud, pos) => {
      if (noeud.isText && noeud.text === '1') {
        position = pos;
      }
    });
    const nouveau = new Transform(document).replaceWith(position, position + 1, document.type.schema.text('un | deux')).doc;
    expect(ecrireMarkdown(nouveau, source)).toBe('Avant.\n\n| a          | b   |\n| ---------- | :-: |\n| un \\| deux | 2   |\n\nAprès.\n');
  });

  it('relit ses cellules avec l’alignement de la colonne', () => {
    const { document } = lireMarkdown('| a | b |\n|--:|---|\n| 1 |\n');
    const aligns: unknown[] = [];
    document.descendants((noeud) => {
      if (noeud.type.name === 'tableCell' || noeud.type.name === 'tableHeader') {
        aligns.push(noeud.attrs['align']);
      }
    });
    expect(aligns).toEqual(['right', null, 'right', null]);
  });
});
