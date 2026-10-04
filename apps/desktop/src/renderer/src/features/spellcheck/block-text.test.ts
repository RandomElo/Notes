import { lireMarkdown } from '@notes/document';
import type { Node as NoeudPm } from '@tiptap/pm/model';
import { describe, expect, it } from 'vitest';
import { caractereDeRemplacement, estBlocAVerifier, rienAVerifier, texteDuBloc } from './block-text';

function blocs(markdown: string): NoeudPm[] {
  const trouves: NoeudPm[] = [];
  lireMarkdown(markdown).document.descendants((noeud) => {
    if (noeud.isTextblock) {
      trouves.push(noeud);
    }
  });
  return trouves;
}

describe("texte d'un bloc pour la correction", () => {
  it('garde un caractère par position du bloc', () => {
    const [paragraphe] = blocs('Il **fesait** beau.\n');
    expect(texteDuBloc(paragraphe!)).toEqual({ texte: 'Il fesait beau.', exclus: [] });
  });

  it('exclut le code en ligne et les adresses', () => {
    const [paragraphe] = blocs('Lance `npm run dev` puis va sur https://exemple.fr/page ou écris à moi@exemple.fr.\n');
    const { texte, exclus } = texteDuBloc(paragraphe!);
    expect(exclus.map(([de, a]) => texte.slice(de, a))).toEqual(['npm run dev', 'https://exemple.fr/page', 'moi@exemple.fr']);
  });

  it('remplace une mention par un caractère exclu', () => {
    const [paragraphe] = blocs('Voir [Ma page](notes://0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b) demain.\n');
    const { texte, exclus } = texteDuBloc(paragraphe!);
    expect(texte).toBe(`Voir ${caractereDeRemplacement} demain.`);
    expect(exclus).toEqual([[5, 6]]);
  });

  it('ne vérifie pas un bloc de code', () => {
    const tous = blocs('Du texte.\n\n```js\nconst x = 1;\n```\n');
    expect(tous.map(estBlocAVerifier)).toEqual([true, false]);
  });

  it("sait quand il n'y a rien à vérifier", () => {
    expect(rienAVerifier({ texte: '', exclus: [] })).toBe(true);
    expect(rienAVerifier({ texte: '   ', exclus: [] })).toBe(true);
    expect(rienAVerifier({ texte: 'https://exemple.fr', exclus: [[0, 18]] })).toBe(true);
    expect(rienAVerifier({ texte: 'Bonjour', exclus: [] })).toBe(false);
  });
});
