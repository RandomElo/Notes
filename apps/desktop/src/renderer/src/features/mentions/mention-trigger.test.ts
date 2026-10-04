import { extensionsDuSchema } from '@notes/document';
import { Editor } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import { declencheurDeMention } from './mention-trigger';

function etatApres(texte: string, type = 'paragraph') {
  const editeur = new Editor({
    element: null,
    extensions: extensionsDuSchema,
    content: { type: 'doc', content: [{ type, content: texte === '' ? [] : [{ type: 'text', text: texte }] }] },
  });
  editeur.commands.setTextSelection(texte.length + 1);
  const etat = editeur.state;
  editeur.destroy();
  return etat;
}

describe('déclencheur de mention', () => {
  it.each([
    ['@', ''],
    ['voir @', ''],
    ['voir @Proj', 'Proj'],
    ['voir @Refonte du', 'Refonte du'],
    ['(@page', 'page'],
  ])('%j cherche %j', (texte, requete) => {
    expect(declencheurDeMention(etatApres(texte))?.requete).toBe(requete);
  });

  it.each(['moi@example.com', 'voir @ page', 'voir @a  b', 'aucun'])('%j n’ouvre rien', (texte) => {
    expect(declencheurDeMention(etatApres(texte))).toBeNull();
  });

  it('n’ouvre rien dans un bloc de code', () => {
    expect(declencheurDeMention(etatApres('@x', 'codeBlock'))).toBeNull();
  });

  it('donne la plage à remplacer', () => {
    expect(declencheurDeMention(etatApres('ab @cd'))).toEqual({ de: 4, a: 7, requete: 'cd' });
  });
});
