import { describe, expect, it } from 'vitest';
import { cheminDeLImage } from './image-path';

describe('chemin d’une image', () => {
  it('part du dossier de la page', () => {
    expect(cheminDeLImage('Projets/NAS', 'assets/x.png')).toBe('Projets/NAS/assets/x.png');
    expect(cheminDeLImage('Projets/NAS', './assets/%C3%A9t%C3%A9%202026.png')).toBe('Projets/NAS/assets/été 2026.png');
    expect(cheminDeLImage('Projets/NAS', '../Autre/assets/y.png')).toBe('Projets/Autre/assets/y.png');
    expect(cheminDeLImage('Projets/NAS', '../../x.png')).toBe('x.png');
  });

  it('ignore le fragment des réglages', () => {
    expect(cheminDeLImage('P', 'assets/x.png#largeur=33')).toBe('P/assets/x.png');
  });

  it('refuse ce qui ne vient pas du dossier des notes', () => {
    for (const src of ['https://example.com/a.png', 'data:image/png;base64,AAAA', 'file:///etc/passwd', '/etc/passwd', '../../../x.png', 'a%2F..%2F..%2Fx', '', 'C:\\x.png']) {
      expect(cheminDeLImage('Projets/NAS', src), src).toBeNull();
    }
  });
});
