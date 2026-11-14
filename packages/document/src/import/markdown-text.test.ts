import { describe, expect, it } from 'vitest';
import { ressembleAMarkdown } from './markdown-text';

describe('texte collé qui ressemble à du Markdown', () => {
  it('reconnaît un titre, un bloc de code, un tableau ou une liste', () => {
    expect(ressembleAMarkdown('## Titre\n\nUn paragraphe.')).toBe(true);
    expect(ressembleAMarkdown('Voici :\n```ts\nconst a = 1;\n```')).toBe(true);
    expect(ressembleAMarkdown('| A | B |\n| --- | --- |\n| 1 | 2 |')).toBe(true);
    expect(ressembleAMarkdown('- un\n- deux')).toBe(true);
    expect(ressembleAMarkdown('1. un\n2. deux')).toBe(true);
    expect(ressembleAMarkdown('- [ ] une\n- [x] deux')).toBe(true);
  });

  it('laisse du texte ordinaire se coller comme du texte', () => {
    expect(ressembleAMarkdown('Une phrase simple.')).toBe(false);
    expect(ressembleAMarkdown('Une ligne\nune autre ligne')).toBe(false);
    expect(ressembleAMarkdown('- un seul tiret en début de ligne')).toBe(false);
    expect(ressembleAMarkdown('#hashtag sans espace')).toBe(false);
  });
});
