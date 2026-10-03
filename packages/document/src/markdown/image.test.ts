import { describe, expect, it } from 'vitest';
import { ecrireAdresse, ecrireImage, lireAdresse } from './image';

describe('adresse d’une image', () => {
  it('sépare la largeur et l’alignement du fragment', () => {
    expect(lireAdresse('assets/x.png#largeur=66&align=centre')).toEqual({ src: 'assets/x.png', largeur: 66, alignement: 'centre' });
    expect(lireAdresse('assets/x.png#align=gauche')).toEqual({ src: 'assets/x.png', largeur: null, alignement: 'gauche' });
    // Toute largeur entière de 10 à 100, réglée à la glissière.
    for (const largeur of [10, 45, 100]) {
      expect(lireAdresse(`a.png#largeur=${largeur}`)).toEqual({ src: 'a.png', largeur, alignement: null });
    }
  });

  it('laisse dans l’adresse un fragment qui n’est pas exactement le sien', () => {
    for (const adresse of ['a.png#largeur=5', 'a.png#largeur=101', 'a.png#largeur=45.5', 'a.png#largeur=-20', 'a.png#page=2', 'a.png#largeur=66&largeur=33', 'a.png#largeur=066', 'a.png#', 'a.png#align=centre=x']) {
      expect(lireAdresse(adresse)).toEqual({ src: adresse, largeur: null, alignement: null });
    }
  });

  it('n’écrit que les réglages donnés, largeur d’abord', () => {
    expect(ecrireAdresse({ src: 'a.png', largeur: null, alignement: null })).toBe('a.png');
    expect(ecrireAdresse({ src: 'a.png', largeur: 33, alignement: 'droite' })).toBe('a.png#largeur=33&align=droite');
  });

  it('écrit les accents en clair et encode ce qui couperait l’adresse', () => {
    expect(ecrireAdresse({ src: 'assets/%C3%A9t%C3%A9%202026.png', largeur: null, alignement: null })).toBe('assets/été%202026.png');
    expect(ecrireAdresse({ src: 'a b(1).png', largeur: null, alignement: null })).toBe('a%20b\\(1\\).png');
  });
});

describe('Markdown d’une image', () => {
  it('échappe le texte alternatif et la légende', () => {
    expect(ecrireImage({ src: 'a.png', alt: 'un *mot* [x]', title: 'dit "oui"', largeur: null, alignement: null })).toBe(
      '![un \\*mot\\* \\[x\\]](a.png "dit \\"oui\\"")',
    );
  });

  it('met le texte et la légende sur une ligne', () => {
    expect(ecrireImage({ src: 'a.png', alt: 'deux\nlignes', title: 'a\nb', largeur: 100, alignement: null })).toBe('![deux lignes](a.png#largeur=100 "a b")');
  });
});
