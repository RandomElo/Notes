import { describe, expect, it } from 'vitest';
import { ecrireMarkdown, lireMarkdown } from '../index';
import { ecrireCallout } from './callout';

const premierBloc = (texte: string) => lireMarkdown(texte).document.firstChild?.toJSON() as Record<string, unknown>;

describe('callout', () => {
  it('lit le type, l’icône et le texte mis en forme', () => {
    expect(premierBloc('```notes-callout\ntype: danger\nicon: 🔥\ntext: |-\n  un **mot**\n\n  suite\n```\n')).toEqual({
      type: 'callout',
      attrs: { type: 'danger', icon: '🔥' },
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'un ' }, { type: 'text', text: 'mot', marks: [{ type: 'bold' }] }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'suite' }] },
      ],
    });
  });

  it('garde les valeurs en texte : « 2026 » reste une icône', () => {
    expect(premierBloc('```notes-callout\nicon: 2026\n```\n')).toMatchObject({ type: 'callout', attrs: { type: null, icon: '2026' } });
  });

  it('reste un bloc de code s’il n’est pas de la forme attendue', () => {
    for (const yaml of ['type: rouge', 'autre: x', 'text: [a, b]', '- liste', 'text: |\n  # titre', 'type: info\ntype: info', 'text: *alias', ': :']) {
      expect(premierBloc('```notes-callout\n' + yaml + '\n```\n'), yaml).toMatchObject({ type: 'codeBlock', attrs: { language: 'notes-callout' } });
    }
  });

  it('écrit un YAML qui se relit à l’identique', () => {
    expect(ecrireCallout('info', '💡', 'une ligne')).toBe('type: info\nicon: 💡\ntext: une ligne');
    expect(ecrireCallout(null, null, 'deux\n\nparagraphes')).toBe('text: |-\n  deux\n\n  paragraphes');
    expect(ecrireCallout(null, '#', '')).toBe('icon: "#"');
    expect(ecrireCallout(null, null, '')).toBe('');
  });

  it('n’écrit pas les paragraphes vides', () => {
    const { document } = lireMarkdown('```notes-callout\ntext: a\n```\n');
    const callout = document.firstChild!;
    const avecVide = callout.copy(callout.content.addToEnd(document.type.schema.nodes['paragraph']!.create()));
    expect(ecrireMarkdown(document.copy(document.content.replaceChild(0, avecVide)))).toBe('```notes-callout\ntext: a\n```\n');
  });
});
