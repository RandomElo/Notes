import { describe, expect, it } from 'vitest';
import { chercherEmojis, emojis } from './emoji-search';
import { motsFrancais } from './lucide-fr';
import { chercherIcones, nomsLucide } from './lucide-search';
import { composantLucide } from './PageIcon';

describe('recherche d’emojis en français', () => {
  it('trouve par le nom et par les mots-clés, sans accents', () => {
    expect(chercherEmojis('livre ouvert')[0]?.emoji).toBe('📖');
    expect(chercherEmojis('fusee').map((entree) => entree.emoji)).toContain('🚀');
    expect(chercherEmojis('COEUR').length).toBeGreaterThanOrEqual(5);
    expect(chercherEmojis('')).toBe(emojis);
    expect(chercherEmojis('zzzzqqq')).toEqual([]);
  });
});

describe('recherche d’icônes Lucide', () => {
  it('connaît les noms en kebab-case, chacun retrouvant son composant', () => {
    expect(nomsLucide).toContain('book-open');
    expect(nomsLucide).toContain('heading-1');
    expect(nomsLucide.every((nom) => composantLucide(nom) !== null)).toBe(true);
  });

  it('trouve par un mot français, puis par le nom anglais', () => {
    expect(chercherIcones('maison')).toContain('house');
    expect(chercherIcones('mais')).toContain('house');
    expect(chercherIcones('vélo')).toContain('bike');
    expect(chercherIcones('book')).toContain('book-open');
    expect(chercherIcones('livre')[0]).toMatch(/book|library/);
  });

  it('trouve au moins une icône pour chaque mot de la table', () => {
    const sansIcone = Object.keys(motsFrancais).filter((mot) => chercherIcones(mot).length === 0);
    expect(sansIcone).toEqual([]);
    expect(chercherIcones('zzz')).toEqual([]);
  });
});
