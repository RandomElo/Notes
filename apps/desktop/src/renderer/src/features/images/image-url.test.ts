import { schema } from '@notes/document';
import { cheminDeLImage } from '@notes/ui';
import { Fragment } from '@tiptap/pm/model';
import { describe, expect, it } from 'vitest';
import { adresseDImage, adresseDepuis, dossierDeLaPage, readresserImages } from './image-url';

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

describe('image collée depuis une autre page', () => {
  it('donne une adresse qui retombe sur le fichier d’origine', () => {
    expect(adresseDepuis('Courses', 'Projets/assets/x.webp')).toBe('../Projets/assets/x.webp');
    expect(adresseDepuis('A/B', 'Projets/Refonte du NAS/assets/é t.webp')).toBe('../../Projets/Refonte%20du%20NAS/assets/%C3%A9%20t.webp');
    expect(cheminDeLImage('A/B', adresseDepuis('A/B', 'Projets/Refonte du NAS/assets/é t.webp'))).toBe('Projets/Refonte du NAS/assets/é t.webp');
  });

  it('réadresse les images de la page d’origine, et elles seules', () => {
    const image = (src: string) => schema.nodes['image']!.create({ src });
    const { contenu, fichiers } = readresserImages(
      Fragment.fromArray([image('assets/a.webp'), schema.nodes['paragraph']!.create(null, schema.text('x')), image('https://example.com/b.png')]),
      'Projets',
      'Courses',
    );
    expect(contenu.child(0).attrs['src']).toBe('../Projets/assets/a.webp');
    expect(contenu.child(2).attrs['src']).toBe('https://example.com/b.png');
    expect([...fichiers]).toEqual([['../Projets/assets/a.webp', 'Projets/assets/a.webp']]);
  });
});
