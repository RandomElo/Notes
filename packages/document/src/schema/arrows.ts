import { Extension, textInputRule } from '@tiptap/core';

/** Ce qui se remplace à la saisie, et par quoi. Seules les flèches simples : `=>` reste tel quel. */
export const fleches: ReadonlyArray<{ motif: RegExp; fleche: string }> = [
  { motif: /->$/, fleche: '→' },
  { motif: /<-$/, fleche: '←' },
];

/**
 * Flèches simples à la saisie (docs/spec/editeur.md) : `->` devient →, `<-`
 * devient ←. Les règles de saisie de TipTap ne jouent pas dans le code (bloc
 * ou marque), où `->` reste tel quel. `Retour arrière` juste après rend les
 * deux caractères tapés.
 */
export const Fleches = Extension.create({
  name: 'fleches',
  addInputRules() {
    return fleches.map(({ motif, fleche }) => textInputRule({ find: motif, replace: fleche }));
  },
});
