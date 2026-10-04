import { Editor } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import { extensionsDuSchema, schema } from './extensions';

describe('schéma', () => {
  it('contient les blocs et les marques du jalon', () => {
    expect(Object.keys(schema.nodes).sort()).toEqual([
      'blockquote', 'bulletList', 'callout', 'codeBlock', 'doc', 'hardBreak', 'heading', 'horizontalRule', 'image', 'listItem',
      'orderedList', 'pageMention', 'paragraph', 'rawBlock', 'table', 'tableCell', 'tableHeader', 'tableRow', 'taskItem', 'taskList', 'text',
    ]);
    expect(Object.keys(schema.marks).sort()).toEqual(['bold', 'code', 'highlight', 'italic', 'link', 'strike', 'underline']);
  });

  it('se construit sans DOM : le paquet tourne tel quel hors d’un navigateur', () => {
    expect('document' in globalThis).toBe(false);
    const editeur = new Editor({ element: null, extensions: extensionsDuSchema, content: { type: 'doc', content: [{ type: 'paragraph' }] } });
    expect(editeur.state.doc.childCount).toBe(1);
    editeur.destroy();
  });

  it('accepte du code en gras', () => {
    const texte = schema.text('x', [schema.marks['bold']!.create(), schema.marks['code']!.create()]);
    expect(() => schema.nodes['paragraph']!.create(null, texte).check()).not.toThrow();
  });
});
