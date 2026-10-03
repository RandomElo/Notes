import { describe, expect, it } from 'vitest';
import { adresseDImage, dossierDeLaPage } from './image-url';

describe('adresse d’une image', () => {
  it('passe par le protocole des images, chaque morceau encodé', () => {
    expect(adresseDImage('Projets/Été 2026', 'assets/%C3%A9t%C3%A9.png#largeur=33')).toBe('notes-asset://vault/Projets/%C3%89t%C3%A9%202026/assets/%C3%A9t%C3%A9.png');
  });

  it('ne charge rien d’Internet', () => {
    expect(adresseDImage('P', 'https://example.com/a.png')).toBeNull();
  });

  it('part du dossier d’une note posée seule', () => {
    expect(dossierDeLaPage('Projets/note.md', 'fichier')).toBe('Projets');
    expect(dossierDeLaPage('Projets/Page', 'page')).toBe('Projets/Page');
  });
});
