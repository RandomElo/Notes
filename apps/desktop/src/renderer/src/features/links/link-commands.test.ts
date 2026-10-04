import { extensionsDuSchema } from '@notes/document';
import { Editor } from '@tiptap/core';
import type { JSONContent } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import { lienA, lienDuCurseur, normaliserAdresse, poserLien, retirerLien } from './link-commands';

const id = '0199a0b0-0000-7000-8000-000000000002';

function editeur(contenu: JSONContent[]) {
  return new Editor({ element: null, extensions: extensionsDuSchema, content: { type: 'doc', content: [{ type: 'paragraph', content: contenu }] } });
}
const lien = (texte: string, href: string, ...autres: string[]) => ({
  type: 'text',
  text: texte,
  marks: [{ type: 'link', attrs: { href, title: null } }, ...autres.map((type) => ({ type }))],
});

describe('liens', () => {
  it('trouve le lien d’une position et celui du curseur', () => {
    const e = editeur([{ type: 'text', text: 'ab ' }, lien('lien', 'https://example.com'), { type: 'text', text: ' fin' }]);
    expect(lienA(e.state, 5)).toEqual({ de: 4, a: 8, texte: 'lien', adresse: 'https://example.com', titre: null });
    e.commands.setTextSelection(6);
    expect(lienDuCurseur(e.state)?.texte).toBe('lien');
    e.commands.setTextSelection(4);
    expect(lienDuCurseur(e.state)).toBeNull();
    expect(lienA(e.state, 2)).toBeNull();
    e.destroy();
  });

  it.each([
    ['https://example.com', 'https://example.com'],
    ['example.com/a?b', 'https://example.com/a?b'],
    ['moi@example.com', 'mailto:moi@example.com'],
    [`notes://${id}`, `notes://${id}`],
    ['pas une adresse', null],
    ['javascript:alert(1)', null],
    ['', null],
  ])('normalise %j', (saisie, attendu) => {
    expect(normaliserAdresse(saisie)).toBe(attendu);
  });

  it('pose un lien sur une sélection, change son texte, puis le retire', () => {
    const e = editeur([{ type: 'text', text: 'voir ici svp' }]);
    e.view.dispatch(poserLien(e.state, { de: 6, a: 9 }, 'ici', 'https://example.com'));
    expect(lienA(e.state, 7)).toMatchObject({ texte: 'ici', adresse: 'https://example.com' });
    e.view.dispatch(poserLien(e.state, { de: 6, a: 9 }, 'là-bas', 'https://example.org'));
    expect(e.state.doc.textContent).toBe('voir là-bas svp');
    expect(lienA(e.state, 7)).toMatchObject({ de: 6, a: 12, adresse: 'https://example.org' });
    e.view.dispatch(retirerLien(e.state, { de: 6, a: 12 }));
    expect(lienA(e.state, 7)).toBeNull();
    expect(e.state.doc.textContent).toBe('voir là-bas svp');
    e.destroy();
  });

  it('nettoie le texte d’une adresse posée sans texte, et garde la mise en forme', () => {
    const e = editeur([{ type: 'text', text: 'x', marks: [{ type: 'bold' }] }]);
    e.view.dispatch(poserLien(e.state, { de: 1, a: 2 }, '', 'https://www.google.com/'));
    expect(e.state.doc.textContent).toBe('google.com');
    expect(e.state.doc.firstChild?.firstChild?.marks.map((marque) => marque.type.name).sort()).toEqual(['bold', 'link']);
    e.destroy();
  });

  it('fait d’un lien vers une page une mention', () => {
    const e = editeur([{ type: 'text', text: 'ab' }]);
    e.view.dispatch(poserLien(e.state, { de: 1, a: 3 }, 'Projets', `notes://${id}`));
    expect(e.state.doc.firstChild?.firstChild?.toJSON()).toEqual({ type: 'pageMention', attrs: { id, libelle: 'Projets', title: null } });
    e.destroy();
  });
});
