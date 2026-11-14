import type { UnusedFile } from '@notes/core';
import { describe, expect, it } from 'vitest';
import { fichiersMontres, libelleDeTaille, pageDuFichier, resume } from './unused-files';

const fichier = (chemin: string, nature: UnusedFile['nature'], taille: number, modifieLe: number): UnusedFile => ({ chemin, nature, taille, modifieLe });
const liste = [fichier('A/assets/b.png', 'image', 300, 2), fichier('A/B/assets/cours.pdf', 'pdf', 5_000_000, 1), fichier('assets/a.png', 'image', 10, 3)];

describe('fichiers inutilisés', () => {
  it('trie par taille, nom ou date, et filtre par nature', () => {
    expect(fichiersMontres(liste, 'tous', 'taille').map((f) => f.chemin)).toEqual(['A/B/assets/cours.pdf', 'A/assets/b.png', 'assets/a.png']);
    expect(fichiersMontres(liste, 'tous', 'nom').map((f) => f.chemin)).toEqual(['assets/a.png', 'A/assets/b.png', 'A/B/assets/cours.pdf']);
    expect(fichiersMontres(liste, 'tous', 'date').map((f) => f.chemin)).toEqual(['A/B/assets/cours.pdf', 'A/assets/b.png', 'assets/a.png']);
    expect(fichiersMontres(liste, 'pdf', 'taille').map((f) => f.chemin)).toEqual(['A/B/assets/cours.pdf']);
  });

  it('dit la taille, la page et le total lisiblement', () => {
    expect(libelleDeTaille(812)).toBe('812 o');
    expect(libelleDeTaille(34 * 1024)).toBe('34 Ko');
    expect(libelleDeTaille(2.4 * 1024 * 1024)).toBe('2,4 Mo');
    expect(pageDuFichier('A/B/assets/cours.pdf')).toBe('A / B');
    expect(pageDuFichier('assets/a.png')).toBe('');
    expect(resume(liste.slice(0, 1))).toBe('un fichier, 300 o');
  });
});
