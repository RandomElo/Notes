import { describe, expect, it } from 'vitest';
import { ancreDuTitre } from './clean-render';

describe('ancreDuTitre', () => {
  it('donne une ancre sans accents, unique dans la page', () => {
    const prises = new Set<string>();
    expect(ancreDuTitre('Étape 1 : préparer le NAS', prises)).toBe('etape-1-preparer-le-nas');
    expect(ancreDuTitre('Étape 1 : préparer le NAS', prises)).toBe('etape-1-preparer-le-nas-2');
    expect(ancreDuTitre('🚀', prises)).toBe('titre');
  });
});
