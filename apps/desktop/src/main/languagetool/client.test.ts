import { describe, expect, it } from 'vitest';
import { annotation, lectureDUnExclu, lireReponse, verifierDemande } from './client';

describe('client LanguageTool', () => {
  it('revérifie la demande du renderer', () => {
    expect(verifierDemande({ texte: 'Il fesait beau', exclus: [] })).toEqual({ texte: 'Il fesait beau', exclus: [] });
    expect(
      verifierDemande({
        texte: 'abc def',
        exclus: [
          [0, 3],
          [4, 7],
        ],
      }),
    ).toEqual({
      texte: 'abc def',
      exclus: [
        [0, 3],
        [4, 7],
      ],
    });
    expect(verifierDemande(null)).toBeNull();
    expect(verifierDemande({ texte: 'x'.repeat(20_001), exclus: [] })).toBeNull();
    expect(verifierDemande({ texte: 'abc', exclus: [[2, 1]] })).toBeNull();
    expect(verifierDemande({ texte: 'abc', exclus: [[0, 4]] })).toBeNull();
    expect(
      verifierDemande({
        texte: 'abcdef',
        exclus: [
          [2, 4],
          [3, 5],
        ],
      }),
    ).toBeNull();
    expect(verifierDemande({ texte: 'abc', exclus: [[0.5, 2]] })).toBeNull();
  });

  it('annote les passages exclus sans changer les positions', () => {
    expect(annotation({ texte: 'Lance npm run dev ici', exclus: [[6, 17]] })).toEqual({
      annotation: [{ text: 'Lance ' }, { markup: 'npm run dev', interpretAs: lectureDUnExclu }, { text: ' ici' }],
    });
    expect(annotation({ texte: '\uFFFC voir', exclus: [[0, 1]] }).annotation[0]).toEqual({ markup: '\uFFFC', interpretAs: lectureDUnExclu });
  });

  it('relit la réponse sans lui faire confiance', () => {
    const texte = 'Il fesait beau.';
    const reponse = {
      matches: [
        {
          offset: 3,
          length: 6,
          message: 'Faute de frappe.',
          replacements: [{ value: 'faisait' }, { value: 'fêtait' }],
          rule: { id: 'FR_SPELLING_RULE', issueType: 'misspelling' },
        },
        { offset: 0, length: 2, shortMessage: 'Accord', replacements: [], rule: { id: 'ACCORD', issueType: 'grammar' } },
        { offset: 14, length: 5, message: 'hors du texte', rule: {} },
        { offset: -1, length: 2, rule: {} },
        'pas un objet',
      ],
    };
    expect(lireReponse(reponse, texte)).toEqual([
      { de: 3, a: 9, mot: 'fesait', message: 'Faute de frappe.', regle: 'FR_SPELLING_RULE', nature: 'orthographe', suggestions: ['faisait', 'fêtait'] },
      { de: 0, a: 2, mot: 'Il', message: 'Accord', regle: 'ACCORD', nature: 'grammaire', suggestions: [] },
    ]);
    expect(lireReponse({ autre: 1 }, texte)).toEqual([]);
  });
});
