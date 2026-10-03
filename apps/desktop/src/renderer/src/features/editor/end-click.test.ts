import { ecrireMarkdown, lireMarkdown } from '@notes/document';
import { EditorState } from '@tiptap/pm/state';
import { describe, expect, it } from 'vitest';
import { allerALaFin } from './end-click';

const etatDe = (markdown: string): EditorState => EditorState.create({ doc: lireMarkdown(markdown).document });

describe('clic sous le dernier bloc', () => {
  it('ajoute un paragraphe vide après un bloc qui n’en est pas un et y met le curseur', () => {
    for (const markdown of ['# Titre\n', '```ts\nconst a = 1;\n```\n', '- un\n- deux\n', 'Un paragraphe.\n']) {
      const avant = etatDe(markdown);
      const apres = avant.apply(allerALaFin(avant));
      expect(apres.doc.childCount).toBe(avant.doc.childCount + 1);
      expect(apres.doc.lastChild?.type.name).toBe('paragraph');
      expect(apres.selection.$from.parent).toBe(apres.doc.lastChild);
      // Rien ne change dans le fichier tant que le paragraphe reste vide.
      const { source } = lireMarkdown(markdown);
      expect(ecrireMarkdown(apres.doc, source)).toBe(markdown);
    }
  });

  it('réutilise un paragraphe vide déjà en fin de page', () => {
    const avant = etatDe('Texte.\n');
    const une = avant.apply(allerALaFin(avant));
    const deux = une.apply(allerALaFin(une));
    expect(deux.doc.childCount).toBe(une.doc.childCount);
    expect(deux.selection.$from.parent).toBe(deux.doc.lastChild);
  });

  it('place le curseur dans une page vide', () => {
    const avant = etatDe('');
    const apres = avant.apply(allerALaFin(avant));
    expect(apres.selection.$from.parent.type.name).toBe('paragraph');
    expect(apres.doc.childCount).toBe(avant.doc.childCount);
  });
});
