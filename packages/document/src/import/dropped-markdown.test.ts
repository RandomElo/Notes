import { describe, expect, it } from 'vitest';
import { imagesLocales, remplacerImages, titreEtCorps } from './dropped-markdown';

describe('Markdown déposé', () => {
  it('repère les images locales, pas les adresses web ni le code', () => {
    const texte = '![a](images/a.png)\n\n![b](https://x.fr/b.png) ![c](<dossier/c d.jpg> "titre")\n\n```\n![d](d.png)\n```\n![a](images/a.png)\n';
    expect(imagesLocales(texte)).toEqual(['images/a.png', 'dossier/c d.jpg']);
    expect(imagesLocales('![x](Notion%20Export/x.png)')).toEqual(['Notion%20Export/x.png']);
  });

  it('remplace les adresses copiées, garde le reste', () => {
    const texte = '![a](images/a.png "t")\n\n```\n![a](images/a.png)\n```\n![z](z.png)\n';
    expect(remplacerImages(texte, new Map([['images/a.png', 'assets/a.png']]))).toBe('![a](assets/a.png "t")\n\n```\n![a](images/a.png)\n```\n![z](z.png)\n');
    expect(remplacerImages('![c](<mes images/c.png>)', new Map([['mes images/c.png', 'assets/c.png']]))).toBe('![c](assets/c.png)');
  });

  it('prend le titre du front-matter, du premier titre ou du nom du fichier', () => {
    expect(titreEtCorps('---\ntitle: "Réunion"\ntags: [a]\n---\nTexte\n', 'x.md')).toEqual({ titre: 'Réunion', corps: 'Texte\n' });
    expect(titreEtCorps('# Mon cours\n\nTexte', 'x.md')).toEqual({ titre: 'Mon cours', corps: 'Texte\n' });
    expect(titreEtCorps('Texte seul\r\n', 'Notes de mardi.md')).toEqual({ titre: 'Notes de mardi', corps: 'Texte seul\n' });
    expect(titreEtCorps('---\ntitle: Autre\n---\n# Premier\nTexte\n', 'x.md')).toEqual({ titre: 'Autre', corps: '# Premier\nTexte\n' });
  });
});
