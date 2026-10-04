import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { describe, expect, it } from 'vitest';
import { schema } from '../schema/extensions';
import { blocCanonique } from './canonical';
import { lireMarkdown } from './parse';

const noeud = (json: unknown): ProseMirrorNode => schema.nodeFromJSON(json);
const texte = (contenu: string, ...marques: (string | { type: string; attrs: Record<string, unknown> })[]): unknown => ({
  type: 'text',
  text: contenu,
  ...(marques.length === 0 ? {} : { marks: marques.map((marque) => (typeof marque === 'string' ? { type: marque } : marque)) }),
});
const paragraphe = (...contenu: unknown[]): unknown => ({ type: 'paragraph', content: contenu });

/** Le bloc écrit puis relu doit redonner exactement le même bloc. */
function attendreAllerRetour(json: unknown): string {
  const bloc = noeud(json);
  const ecrit = blocCanonique(bloc);
  const relu = lireMarkdown(ecrit).document;
  expect(relu.toJSON(), ecrit).toEqual({ type: 'doc', content: [bloc.toJSON()] });
  return ecrit;
}

describe('forme canonique', () => {
  it.each([
    '# pas un titre',
    '#',
    '1. pas une liste',
    '1) pas une liste',
    '12.',
    '+',
    '+ pas une puce',
    '- pas une puce',
    '* pas une puce',
    '> pas une citation',
    '=',
    '===',
    '---',
    '| a | b |',
    '==pas surligné==',
    '=== trois',
    '&amp; &#35; &copy; et un & seul',
    '<https://example.com>',
    '<quelqu.un@example.com>',
    '<div>du HTML</div> et a < b',
    '`pas du code`',
    '[pas un lien](https://example.com)',
    '![pas une image](a.png)',
    '*pas italique* **pas gras** ~~pas barré~~ _pas italique_',
    'snake_case et __init__',
    'une barre \\ oblique et \\* devant une étoile',
    '```',
    '~~~',
    'https://example.com tel quel',
    'ligne 1\n# ligne 2',
    'ligne 1\n- ligne 2',
    'ligne 1\n1. ligne 2',
    'ligne 1\n===',
    'ligne 1\n=',
    'ligne 1\n---',
    'a | b\n|---|---|',
    'a | b\n:-- | --:',
    'ligne 1\n> ligne 2',
    'ligne 1\n```',
    '[ ] pas une tâche',
    '<u>pas souligné</u>',
    'un <u> seul et un </u> seul',
  ])('garde « %s » comme du texte', (contenu) => {
    attendreAllerRetour(paragraphe(texte(contenu)));
  });

  it.each(['fin #', 'C#', '# au début', 'a #b', '*étoile*', '1. un', 'fin ##'])('garde « %s » dans un titre', (contenu) => {
    attendreAllerRetour({ type: 'heading', attrs: { level: 2 }, content: [texte(contenu)] });
  });

  it('écrit les marques et leurs combinaisons', () => {
    expect(
      attendreAllerRetour(
        paragraphe(
          texte('gras', 'bold'),
          texte(' '),
          texte('les deux', 'bold', 'italic'),
          texte(' '),
          texte('sur', 'highlight'),
          texte(' '),
          texte('barré', 'strike'),
          texte(' '),
          texte('code', 'bold', 'code'),
          texte(' '),
          texte('a`b', 'code'),
        ),
      ),
    ).toBe('**gras** ***les deux*** ==sur== ~~barré~~ **`code`** `` a`b ``');
  });

  it('écrit le souligné en balise, seul ou avec d’autres marques', () => {
    expect(attendreAllerRetour(paragraphe(texte('un '), texte('mot', 'underline'), texte(' et '), texte('deux', 'bold', 'underline')))).toBe(
      'un <u>mot</u> et **<u>deux</u>**',
    );
    attendreAllerRetour(paragraphe(texte('lien souligné', 'underline', { type: 'link', attrs: { href: 'https://example.com', title: null } })));
    attendreAllerRetour({ type: 'heading', attrs: { level: 2 }, content: [texte('Titre '), texte('souligné', 'underline')] });
  });

  it('sort les espaces des marques', () => {
    expect(blocCanonique(noeud(paragraphe(texte('un'), texte(' gras ', 'bold'), texte('fin'))))).toBe('un **gras** fin');
  });

  it('écrit les liens, leur titre et les caractères gênants de leur adresse', () => {
    const lien = (href: string, title: string | null = null) => ({ type: 'link', attrs: { href, title } });
    // Un lien interne au texte simple est une mention ; mis en forme, il reste un lien.
    const mention = { type: 'pageMention', attrs: { id: '0199a0b0-0000-7000-8000-000000000003', libelle: 'page [1]', title: null } };
    expect(attendreAllerRetour(paragraphe(texte('Voir '), mention))).toBe('Voir [page \\[1\\]](notes://0199a0b0-0000-7000-8000-000000000003)');
    expect(attendreAllerRetour(paragraphe(texte('page', 'bold', lien('notes://0199a0b0-0000-7000-8000-000000000003'))))).toBe(
      '[**page**](notes://0199a0b0-0000-7000-8000-000000000003)',
    );
    expect(attendreAllerRetour(paragraphe(texte('lien', lien('https://example.com/a_(b)', 'un "titre"'))))).toBe(
      '[lien](https://example.com/a_\\(b\\) "un \\"titre\\"")',
    );
    expect(blocCanonique(noeud(paragraphe(texte('lien', lien('https://example.com/a b')))))).toBe('[lien](https://example.com/a%20b)');
    attendreAllerRetour(paragraphe(texte('gras dans un lien', 'bold', lien('https://example.com'))));
  });

  it('écrit le saut de ligne forcé, sauf en fin de bloc', () => {
    expect(attendreAllerRetour(paragraphe(texte('un'), { type: 'hardBreak' }, texte('deux')))).toBe('un\\\ndeux');
    expect(blocCanonique(noeud(paragraphe(texte('un'), { type: 'hardBreak' })))).toBe('un');
    // Après un saut forcé, on est en début de ligne : ce qui ressemble à un titre ou à une puce doit rester du texte.
    expect(attendreAllerRetour(paragraphe(texte('un'), { type: 'hardBreak' }, texte('# pas un titre')))).toBe('un\\\n\\# pas un titre');
    expect(blocCanonique(noeud(paragraphe(texte('un'), { type: 'hardBreak' }, texte('  deux'))))).toBe('un\\\ndeux');
  });

  it('retire les espaces que Markdown ignorerait ou prendrait pour autre chose', () => {
    expect(blocCanonique(noeud(paragraphe(texte('    quatre espaces'))))).toBe('quatre espaces');
    expect(blocCanonique(noeud(paragraphe(texte('fin de ligne  \nsuite'))))).toBe('fin de ligne\nsuite');
    expect(blocCanonique(noeud({ type: 'heading', attrs: { level: 1 }, content: [texte('sur\ndeux lignes')] }))).toBe('# sur deux lignes');
  });

  it('écrit les blocs vides', () => {
    expect(attendreAllerRetour({ type: 'heading', attrs: { level: 3 } })).toBe('###');
    expect(attendreAllerRetour({ type: 'codeBlock', attrs: { language: null } })).toBe('```\n\n```');
    expect(attendreAllerRetour({ type: 'blockquote', content: [{ type: 'paragraph' }] })).toBe('> ');
    expect(attendreAllerRetour({ type: 'bulletList', attrs: { tight: true }, content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] })).toBe('- ');
    expect(
      attendreAllerRetour({ type: 'taskList', attrs: { tight: true }, content: [{ type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph' }] }] }),
    ).toBe('- [ ] ');
  });

  it('écrit les blocs de code, y compris ceux qui contiennent des clôtures', () => {
    expect(attendreAllerRetour({ type: 'codeBlock', attrs: { language: 'md' }, content: [texte('```ts\ncode\n```\n')] })).toBe(
      '````md\n```ts\ncode\n```\n\n````',
    );
    attendreAllerRetour({ type: 'codeBlock', attrs: { language: null }, content: [texte('  indenté\n\n# pas un titre\n')] });
  });

  it('écrit les listes imbriquées, serrées ou aérées, et les tâches', () => {
    const item = (type: string, attrs: Record<string, unknown> | undefined, ...contenu: unknown[]) => ({ type, ...(attrs ? { attrs } : {}), content: contenu });
    const sousListe = { type: 'bulletList', attrs: { tight: true }, content: [item('listItem', undefined, paragraphe(texte('sous')))] };
    expect(
      attendreAllerRetour({
        type: 'orderedList',
        attrs: { start: 9, type: null, tight: true },
        content: [item('listItem', undefined, paragraphe(texte('neuf')), sousListe), item('listItem', undefined, paragraphe(texte('dix')))],
      }),
    ).toBe(' 9. neuf\n    - sous\n10. dix');
    expect(
      attendreAllerRetour({
        type: 'taskList',
        attrs: { tight: true },
        content: [
          item('taskItem', { checked: true }, paragraphe(texte('faite')), sousListe),
          item('taskItem', { checked: false }, paragraphe(texte('à faire')), { type: 'codeBlock', attrs: { language: null }, content: [texte('code')] }),
        ],
      }),
    ).toBe('- [x] faite\n  - sous\n- [ ] à faire\n  ```\n  code\n  ```');
    expect(
      attendreAllerRetour({
        type: 'bulletList',
        attrs: { tight: false },
        content: [item('listItem', undefined, paragraphe(texte('un')), paragraphe(texte('suite'))), item('listItem', undefined, paragraphe(texte('deux')))],
      }),
    ).toBe('- un\n\n  suite\n\n- deux');
  });

  it('écrit une citation qui contient d’autres blocs', () => {
    expect(
      attendreAllerRetour({
        type: 'blockquote',
        content: [paragraphe(texte('ligne 1\nligne 2')), { type: 'blockquote', content: [paragraphe(texte('dedans'))] }, { type: 'horizontalRule' }],
      }),
    ).toBe('> ligne 1\n> ligne 2\n>\n> > dedans\n>\n> ---');
  });

  it('garde le texte d’un bloc brut', () => {
    expect(attendreAllerRetour({ type: 'rawBlock', attrs: { source: '###### six' } })).toBe('###### six');
  });
});
