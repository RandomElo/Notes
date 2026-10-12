import { lireMarkdown } from '../markdown/parse';
import { ecrireMarkdown } from '../markdown/serialize';
import { schema } from '../schema/extensions';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import type { Transaction } from '@tiptap/pm/state';
import { describe, expect, it } from 'vitest';
import { changerIcone, changerNature, retirerCallout } from './callout';

function dansLeCallout(markdown: string): EditorState {
  const { document } = lireMarkdown(markdown);
  const etat = EditorState.create({ schema, doc: document });
  // Le curseur dans le premier paragraphe du callout : document, callout, paragraphe.
  return etat.apply(etat.tr.setSelection(TextSelection.create(document, 2)));
}

const ecrire = (etat: EditorState, transaction: Transaction | null): string => ecrireMarkdown(etat.apply(transaction as Transaction).doc);

describe('callout', () => {
  it('change de nature, et l’icône de la nature suit', () => {
    const etat = dansLeCallout('```notes-callout\ntype: info\nicon: 💡\ntext: a\n```\n');
    expect(ecrire(etat, changerNature('danger')(etat))).toBe('```notes-callout\ntype: danger\ntext: a\n```\n');
  });

  it('garde une icône choisie quand la nature change', () => {
    const etat = dansLeCallout('```notes-callout\ntype: info\nicon: 🔥\ntext: a\n```\n');
    expect(ecrire(etat, changerNature('success')(etat))).toBe('```notes-callout\ntype: success\nicon: 🔥\ntext: a\n```\n');
  });

  it('n’écrit pas l’icône quand c’est celle de la nature', () => {
    const etat = dansLeCallout('```notes-callout\ntype: warning\ntext: a\n```\n');
    expect(ecrire(etat, changerIcone('🚀')(etat))).toBe('```notes-callout\ntype: warning\nicon: 🚀\ntext: a\n```\n');
    expect(ecrire(etat, changerIcone('⚠️')(etat))).toBe('```notes-callout\ntype: warning\ntext: a\n```\n');
  });

  it('se retire en laissant ses paragraphes', () => {
    const etat = dansLeCallout('```notes-callout\ntext: |-\n  un\n\n  deux\n```\n');
    expect(ecrire(etat, retirerCallout(etat))).toBe('un\n\ndeux\n');
  });

  it('ne fait rien hors d’un callout', () => {
    const etat = EditorState.create({ schema, doc: lireMarkdown('texte\n').document });
    expect(changerNature('info')(etat)).toBeNull();
    expect(retirerCallout(etat)).toBeNull();
  });
});
