import { describe, expect, it } from 'vitest';
import { dureeLisible, libelleDuMemo, tailleLisible, titreDeLAttente } from './memo-labels';

describe('libellés des mémos', () => {
  it('titre un mémo par sa date, ou par son nom à défaut', () => {
    expect(libelleDuMemo('memo-2026-10-11-091500.m4a')).toBe('Mémo du 11 octobre 2026 à 9 h 15');
    expect(libelleDuMemo('autre.m4a')).toBe('autre.m4a');
  });

  it('écrit une durée en minutes et secondes, puis en heures', () => {
    expect(dureeLisible(0)).toBe('0:00');
    expect(dureeLisible(7_900)).toBe('0:07');
    expect(dureeLisible(750_000)).toBe('12:30');
    expect(dureeLisible(3_725_000)).toBe('1:02:05');
  });

  it('écrit une taille en Ko puis en Mo', () => {
    expect(tailleLisible(200)).toBe('1 Ko');
    expect(tailleLisible(240 * 1024)).toBe('240 Ko');
    expect(tailleLisible(2.5 * 1024 * 1024)).toBe('2,5 Mo');
  });

  it('accorde le titre de la liste', () => {
    expect(titreDeLAttente(1)).toBe('1 mémo pas encore envoyé');
    expect(titreDeLAttente(3)).toBe('3 mémos pas encore envoyés');
  });
});
