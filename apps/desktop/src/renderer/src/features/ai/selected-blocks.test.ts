import { EditorState, TextSelection } from '@tiptap/pm/state';
import { lireMarkdown } from '@notes/document';
import { describe, expect, it } from 'vitest';
import { blocsSelectionnes } from './selected-blocks';

const { document } = lireMarkdown('Premier paragraphe.\n\nDeuxième paragraphe.\n\n- un\n- deux\n\nDernier.\n');
const etat = (from: number, to: number) => EditorState.create({ doc: document, selection: TextSelection.create(document, from, to) });
const position = (texte: string): number => {
  let trouve = -1;
  document.descendants((noeud, pos) => {
    if (trouve === -1 && noeud.isText && noeud.text!.includes(texte)) {
      trouve = pos + noeud.text!.indexOf(texte);
    }
  });
  return trouve;
};

describe('blocs sélectionnés pour une fonction IA', () => {
  it('rien sans sélection', () => {
    expect(blocsSelectionnes(etat(3, 3))).toBeNull();
  });

  it('étend la sélection aux blocs entiers qu’elle touche', () => {
    const zone = blocsSelectionnes(etat(position('paragraphe.'), position('deux') + 2))!;
    expect(document.cut(zone.from, zone.to).textContent).toBe('Premier paragraphe.Deuxième paragraphe.undeux');
  });

  it('ne prend pas le bloc où la sélection s’arrête tout au début', () => {
    const zone = blocsSelectionnes(etat(position('Deuxième'), position('un')))!;
    expect(document.cut(zone.from, zone.to).textContent).toBe('Deuxième paragraphe.');
  });

  it('toute la page : rien de particulier', () => {
    expect(blocsSelectionnes(etat(1, document.content.size - 1))).toBeNull();
  });
});
