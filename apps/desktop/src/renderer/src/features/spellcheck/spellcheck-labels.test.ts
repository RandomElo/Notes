import { describe, expect, it } from 'vitest';
import type { SpellcheckStep } from '../../../../shared/ipc-contract';
import { avancement, libelleDEtape, taille } from './spellcheck-labels';

const etape = (modification: Partial<SpellcheckStep>): SpellcheckStep => ({ id: 'languagetool', libelle: 'LanguageTool 6.6', etat: 'a_faire', phase: null, fait: 0, total: 251_998_221, ...modification });

describe('libellés de la correction', () => {
  it('écrit les tailles en Mo et Go', () => {
    expect(taille(46_640_574)).toBe('47 Mo');
    expect(taille(1_824_051_147)).toBe('1,8 Go');
    expect(taille(0)).toBe('1 Mo');
  });

  it('dit où en est chaque étape', () => {
    expect(libelleDEtape(etape({}))).toBe('252 Mo à télécharger');
    expect(libelleDEtape(etape({ etat: 'en_cours', phase: 'telechargement', fait: 126_000_000 }))).toBe('Téléchargement : 50 % (126 Mo sur 252 Mo)');
    expect(libelleDEtape(etape({ etat: 'en_cours', phase: 'verification', fait: 251_998_221 }))).toBe("Vérification de l'empreinte");
    expect(libelleDEtape(etape({ etat: 'en_cours', phase: 'decompression', fait: 63_000_000 }))).toBe('Décompression : 25 %');
    expect(libelleDEtape(etape({ etat: 'fait' }))).toBe('Installé');
  });

  it("donne l'avancement de la barre", () => {
    expect(avancement(etape({ etat: 'en_cours', phase: 'telechargement', fait: 125_999_110 }))).toBeCloseTo(0.5);
    expect(avancement(etape({ etat: 'en_cours', phase: 'verification', fait: 251_998_221 }))).toBe(0);
    expect(avancement(etape({ etat: 'fait' }))).toBe(1);
  });
});
