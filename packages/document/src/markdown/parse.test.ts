import { describe, expect, it } from 'vitest';
import { lireMarkdown } from './parse';

const blocs = (corps: string): unknown[] => (lireMarkdown(corps).document.toJSON() as { content: unknown[] }).content;
const recoller = (corps: string): string => {
  const { source } = lireMarkdown(corps);
  return source.prefixe + source.blocs.map((bloc) => bloc.texte + bloc.separateur).join('');
};

describe('lireMarkdown', () => {
  it('rend un paragraphe vide pour un corps vide', () => {
    const { document, source } = lireMarkdown('');
    expect(document.toJSON()).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
    expect(source).toEqual({ finDeLigne: '\n', prefixe: '', blocs: [] });
  });

  it('découpe la source sans perdre un caractère', () => {
    const textes = [
      '',
      '\n\n',
      'sans fin de ligne',
      '\n\n# Titre\n\n\n\ntexte  \n\n',
      'a\r\n\r\nb\r\n',
      'a\rb\r\rc',
      '- a\n\n\n- b\n\n   \n',
      '```\ncode jamais fermé\n\n\n',
      '[ref]: https://example.com\n\n[autre]: /chemin\ntexte [ref]\n',
      '\ttabulation\n> citation\nsuite paresseuse\n',
      '| a |\n|---|\n| b |\n\n<div>\n\nhtml\n</div>',
      'nul \u0000 dans le texte\n',
    ];
    for (const texte of textes) {
      expect(recoller(texte)).toBe(texte);
    }
  });

  it('retient la fin de ligne du fichier', () => {
    expect(lireMarkdown('a\r\nb\r\n').source.finDeLigne).toBe('\r\n');
    expect(lireMarkdown('a\nb\n').source.finDeLigne).toBe('\n');
  });

  it('garde chaque bloc avec son texte et ce qui le suit', () => {
    const { source } = lireMarkdown('\n# Titre\n\n\ntexte\n- puce\n');
    expect(source.prefixe).toBe('\n');
    expect(source.blocs.map((bloc) => [bloc.noeud.type.name, bloc.texte, bloc.separateur])).toEqual([
      ['heading', '# Titre', '\n\n\n'],
      ['paragraph', 'texte', '\n'],
      ['bulletList', '- puce', '\n'],
    ]);
  });

  it('lit les titres de niveau 1 à 5 et garde le niveau 6 tel quel', () => {
    expect(blocs('##### cinq\n\n###### six\n')).toEqual([
      { type: 'heading', attrs: { level: 5 }, content: [{ type: 'text', text: 'cinq' }] },
      { type: 'rawBlock', attrs: { source: '###### six' } },
    ]);
  });

  it('lit les marques, le code en gras et les liens', () => {
    expect(blocs('**gras** *it* ~~barré~~ ==sur== **`code`** [lien](https://example.com "titre")\n')).toMatchObject([
      {
        content: [
          { text: 'gras', marks: [{ type: 'bold' }] },
          { text: ' ' },
          { text: 'it', marks: [{ type: 'italic' }] },
          { text: ' ' },
          { text: 'barré', marks: [{ type: 'strike' }] },
          { text: ' ' },
          { text: 'sur', marks: [{ type: 'highlight' }] },
          { text: ' ' },
          { text: 'code', marks: [{ type: 'bold' }, { type: 'code' }] },
          { text: ' ' },
          { text: 'lien', marks: [{ type: 'link', attrs: { href: 'https://example.com', title: 'titre' } }] },
        ],
      },
    ]);
  });

  it('lit le souligné, et laisse en texte une balise seule ou tout autre HTML', () => {
    expect(blocs('du <u>souligné **gras**</u> ici\n')).toMatchObject([
      {
        content: [
          { text: 'du ' },
          { text: 'souligné ', marks: [{ type: 'underline' }] },
          { text: 'gras', marks: [{ type: 'bold' }, { type: 'underline' }] },
          { text: ' ici' },
        ],
      },
    ]);
    for (const texte of ['un <u> seul', 'une fermeture </u> seule', 'échappé \\<u>texte</u>', 'dans du `<u>code</u>`', '<U>majuscule</U> <ins>autre</ins>']) {
      const json = JSON.stringify(blocs(texte + '\n'));
      expect(json, texte).not.toContain('underline');
    }
  });

  it('garde un retour à la ligne simple dans le texte et lit le saut forcé', () => {
    expect(blocs('un\ndeux\\\ntrois\n')).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'un\ndeux' }, { type: 'hardBreak' }, { type: 'text', text: 'trois' }] },
    ]);
  });

  it('reconnaît une liste de tâches, cochées ou non, vides ou non', () => {
    expect(blocs('- [ ] à faire\n- [x] faite\n- [X] aussi\n- [ ]\n')).toMatchObject([
      {
        type: 'taskList',
        content: [
          { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ text: 'à faire' }] }] },
          { type: 'taskItem', attrs: { checked: true } },
          { type: 'taskItem', attrs: { checked: true } },
          { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph' }] },
        ],
      },
    ]);
  });

  it('ne prend pas pour des tâches une liste mêlée, des crochets échappés ou un lien', () => {
    for (const texte of ['- [ ] tâche\n- puce\n', '- \\[ \\] texte\n', '- [x](https://example.com)\n', '- [ ]collé\n']) {
      expect(blocs(texte)).toMatchObject([{ type: 'bulletList' }]);
    }
  });

  it('distingue liste serrée et liste aérée, et lit le premier numéro', () => {
    expect(blocs('- a\n- b\n')).toMatchObject([{ attrs: { tight: true } }]);
    expect(blocs('- a\n\n- b\n')).toMatchObject([{ attrs: { tight: false } }]);
    expect(blocs('7. a\n8. b\n')).toMatchObject([{ type: 'orderedList', attrs: { start: 7, tight: true } }]);
  });

  it('lit les blocs de code avec ou sans langage', () => {
    expect(blocs('```ts\nconst a = 1;\n\n```\n\n    indenté\n\n```\n```\n')).toEqual([
      { type: 'codeBlock', attrs: { language: 'ts' }, content: [{ type: 'text', text: 'const a = 1;\n' }] },
      { type: 'codeBlock', attrs: { language: null }, content: [{ type: 'text', text: 'indenté' }] },
      { type: 'codeBlock', attrs: { language: null } },
    ]);
  });

  it('garde tel quel ce que le schéma ne représente pas', () => {
    const texte = '###### six\n\n| a | ![image](a.png) |\n|---|---|\n\ntexte ![image](a.png)\n\n[ref]: https://example.com\n';
    expect(blocs(texte)).toEqual([
      { type: 'rawBlock', attrs: { source: '###### six' } },
      { type: 'rawBlock', attrs: { source: '| a | ![image](a.png) |\n|---|---|' } },
      { type: 'rawBlock', attrs: { source: 'texte ![image](a.png)' } },
      { type: 'rawBlock', attrs: { source: '[ref]: https://example.com' } },
    ]);
  });

  it('garde un bloc entier tel quel si un seul de ses items n’est pas représentable', () => {
    expect(blocs('- puce\n- ![image](a.png)\n')).toEqual([{ type: 'rawBlock', attrs: { source: '- puce\n- ![image](a.png)' } }]);
    expect(blocs('- # titre dans une puce\n')).toMatchObject([{ type: 'rawBlock' }]);
  });

  it('n’interprète jamais le HTML : il reste du texte', () => {
    expect(blocs('<script>alert(1)</script>\n\nun <b>mot</b>\n')).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: '<script>alert(1)</script>' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'un <b>mot</b>' }] },
    ]);
  });

  it('produit toujours un document valide', () => {
    for (const texte of ['- \n', '>\n', '#\n', '1.\n', '- [ ]\n  - [x] sous\n', '> - a\n>\n> ```\n> code\n> ```\n']) {
      expect(() => lireMarkdown(texte).document.check()).not.toThrow();
    }
  });
});
