import { describe, expect, it } from 'vitest';
import { lienDImage } from './image-link';

describe('lien d’image collé', () => {
  it('reconnaît une adresse http ou https qui finit par une image', () => {
    expect(lienDImage('https://example.com/a/schema.png')).toBe('https://example.com/a/schema.png');
    expect(lienDImage('  http://example.com/photo.JPEG?taille=2#x \n')).toBe('http://example.com/photo.JPEG?taille=2#x');
    expect(lienDImage('https://example.com/%C3%A9t%C3%A9.webp')).toBe('https://example.com/%C3%A9t%C3%A9.webp');
  });

  it('laisse tout autre texte se coller normalement', () => {
    for (const texte of ['https://example.com/page.html', 'https://example.com/', 'voir https://example.com/a.png', 'file:///tmp/a.png', 'a.png', 'https://example.com/a.png b']) {
      expect(lienDImage(texte)).toBeNull();
    }
  });
});
