import { describe, expect, it } from 'vitest';
import { classerParTitre, correspondanceFloue, normaliserPourRecherche } from './fuzzy';

const titres = ['Courses', 'Refonte du NAS', 'Recettes de cuisine', 'Réunion équipe', 'Cœur du sujet', 'Notes de course à pied'];
const classer = (saisie: string) => classerParTitre(saisie, titres, (titre) => titre).map((resultat) => resultat.element);

describe('normaliserPourRecherche', () => {
  it('retire accents et majuscules, et garde la position de chaque caractère', () => {
    expect(normaliserPourRecherche('Été à Noël')).toEqual({ texte: 'ete a noel', origines: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] });
  });

  it('défait les ligatures', () => {
    expect(normaliserPourRecherche('Cœur')).toEqual({ texte: 'coeur', origines: [0, 1, 1, 2, 3] });
  });
});

describe('correspondanceFloue', () => {
  it('trouve les lettres dans l’ordre, même séparées', () => {
    expect(correspondanceFloue('rfnas', 'Refonte du NAS')?.positions).toEqual([0, 2, 11, 12, 13]);
  });

  it('refuse un titre où une lettre manque ou n’est pas dans l’ordre', () => {
    expect(correspondanceFloue('xyz', 'Courses')).toBeNull();
    expect(correspondanceFloue('cs', 'Courses')).not.toBeNull();
    expect(correspondanceFloue('sc', 'Courses')).toBeNull();
  });

  it('ignore accents, casse et espaces de la saisie', () => {
    expect(correspondanceFloue('REUNION EQUIPE', 'Réunion équipe')).not.toBeNull();
    expect(correspondanceFloue('reunionequipe', 'Réunion équipe')).not.toBeNull();
    expect(correspondanceFloue('coeur', 'Cœur du sujet')?.positions).toEqual([0, 1, 2, 3]);
  });

  it('une saisie vide correspond à tout', () => {
    expect(correspondanceFloue('  ', 'Courses')).toEqual({ score: 0, positions: [] });
  });

  it('préfère les lettres qui se suivent et les débuts de mot', () => {
    const collees = correspondanceFloue('cour', 'Courses');
    const eparses = correspondanceFloue('cour', 'Cuisine pour tous');
    expect(collees?.score).toBeGreaterThan(eparses?.score ?? Number.POSITIVE_INFINITY);
    expect(correspondanceFloue('nas', 'Refonte du NAS')?.positions).toEqual([11, 12, 13]);
  });
});

describe('classerParTitre', () => {
  it('met le meilleur titre en premier', () => {
    expect(classer('course')[0]).toBe('Courses');
    expect(classer('course')).toContain('Notes de course à pied');
    expect(classer('rec')[0]).toBe('Recettes de cuisine');
  });

  it('ne garde que les titres qui correspondent', () => {
    expect(classer('nas')).toEqual(['Refonte du NAS']);
    expect(classer('qwerty')).toEqual([]);
  });

  it('à score égal, garde l’ordre donné', () => {
    expect(classerParTitre('', ['b', 'a', 'c'], (titre) => titre).map((resultat) => resultat.element)).toEqual(['b', 'a', 'c']);
  });
});
