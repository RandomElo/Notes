import { markInputRule } from '@tiptap/core';
import type { Mark } from '@tiptap/core';

/**
 * Les raccourcis de saisie de TipTap (`**gras**`, `*italique*`...) ne se
 * déclenchent qu'en début de ligne ou après une espace. En français on écrit
 * aussi « l'*italique* » ou « (**important**) » : cette règle ajoute le cas où
 * la marque suit une apostrophe, une parenthèse, un guillemet ou un tiret.
 */
export function avecElision<Options, Stockage>(marque: Mark<Options, Stockage>, delimiteur: string): Mark<Options, Stockage> {
  const d = delimiteur.replace(/[*]/g, '\\$&');
  const interdit = delimiteur.charAt(0).replace(/[*]/, '\\$&');
  const motif = new RegExp(`(?<=['’(\\[«“"/-])(${d}(?!\\s+${d})((?:[^${interdit}]+))${d}(?!\\s+${d}))$`);
  return marque.extend({
    addInputRules() {
      return [...(this.parent?.() ?? []), markInputRule({ find: motif, type: this.type })];
    },
  });
}
