import { describe, expect, it } from 'vitest';
import { verifierCheminRelatif } from '../fs/paths';
import { longueurMaxNom, nomDeDossier, nomLibre, verifierTitre } from './naming';

describe('nomDeDossier', () => {
  it.each([
    ['Refonte du NAS', 'Refonte du NAS'],
    ['Compte-rendu : réunion 12/03', 'Compte-rendu - réunion 12-03'],
    ['a\\b/c:d*e?f"g<h>i|j', 'a-b-c-d-e-f-g-h-i-j'],
    ['  espaces   multiples  ', 'espaces multiples'],
    ['fini par un point...', 'fini par un point'],
    ['.caché', 'caché'],
    ['...', 'Sans titre'],
    ['', 'Sans titre'],
    ['Été à Zürich 🏃', 'Été à Zürich 🏃'],
  ])('%j donne %j', (titre, attendu) => {
    expect(nomDeDossier(titre)).toBe(attendu);
  });

  it('borne la longueur sans couper un caractère en deux', () => {
    const nom = nomDeDossier('🏃'.repeat(150));
    expect([...nom]).toHaveLength(longueurMaxNom);
  });

  it('donne toujours un nom accepté comme segment de chemin', () => {
    for (const titre of ['a/b', 'x.', ' y ', 'CON:', '..', 'tab\tulation', 'fin. . .']) {
      expect(verifierCheminRelatif(nomDeDossier(titre))).toBeNull();
    }
  });
});

describe('nomLibre', () => {
  it('garde le nom voulu quand il est libre', () => {
    expect(nomLibre('Projets', ['Idées'])).toBe('Projets');
  });

  it('numérote en cas de collision, sans distinguer la casse', () => {
    expect(nomLibre('Projets', ['projets'])).toBe('Projets 2');
    expect(nomLibre('Projets', ['Projets', 'Projets 2', 'PROJETS 3'])).toBe('Projets 4');
  });

  it('reste sous la longueur maximale même avec le suffixe', () => {
    const long = 'a'.repeat(longueurMaxNom);
    expect([...nomLibre(long, [long])]).toHaveLength(longueurMaxNom);
  });
});

describe('verifierTitre', () => {
  it('accepte un titre ordinaire et refuse le vide, le multiligne et le trop long', () => {
    expect(verifierTitre('Idées')).toBeNull();
    expect(verifierTitre('   ')).not.toBeNull();
    expect(verifierTitre('deux\nlignes')).not.toBeNull();
    expect(verifierTitre('x'.repeat(201))).not.toBeNull();
  });
});
