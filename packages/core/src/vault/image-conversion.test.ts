import { describe, expect, it } from 'vitest';
import { versOctets } from '../fs/utf8';
import { MemoryLocalFs, contexteDeTest } from '../testing/memory-fs';
import { listerImagesAConvertir, nomEnWebp, remplacerImageDansTexte, remplacerParWebp } from './image-conversion';

const octets = (...valeurs: number[]): Uint8Array => new Uint8Array(valeurs);
const png = octets(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0);
const gif = versOctets('GIF89a....');
const webp = versOctets('RIFF\0\0\0\0WEBPVP8 ');
const page = (corps: string) => `---\nid: 0199a0b0-0000-7000-8000-000000000001\ntitle: Page\ncreated: 2026-01-01T00:00:00.000Z\nupdated: 2026-01-01T00:00:00.000Z\n---\n${corps}`;

describe('adresse d’image dans le texte d’une page', () => {
  it('remplace la cible, avec ses réglages, en clair ou encodée, et rien d’autre', () => {
    const texte = [
      '![Été](assets/été.png#largeur=45 "Légende")',
      '![encodé](assets/%C3%A9t%C3%A9.png)',
      '[lien](./assets/été.png)',
      'Le fichier assets/été.png cité dans le texte.',
      '![autre](assets/été.png.bak)',
    ].join('\n\n');
    const { texte: apres, remplacements } = remplacerImageDansTexte(texte, 'été.png', 'été.webp');
    expect(remplacements).toBe(3);
    expect(apres).toBe(
      [
        '![Été](assets/été.webp#largeur=45 "Légende")',
        '![encodé](assets/%C3%A9t%C3%A9.webp)',
        '[lien](./assets/été.webp)',
        'Le fichier assets/été.png cité dans le texte.',
        '![autre](assets/été.png.bak)',
      ].join('\n\n'),
    );
  });

  it('donne le nom en WebP', () => {
    expect(nomEnWebp('schema.png')).toBe('schema.webp');
    expect(nomEnWebp('photo.v2.JPEG')).toBe('photo.v2.webp');
    expect(nomEnWebp(null)).toBeNull();
  });
});

describe('images à convertir', () => {
  it('liste les PNG, JPEG et AVIF affichés par une page, pas les GIF, WebP ni orphelines', async () => {
    const fs = MemoryLocalFs.depuis({ 'A/page.md': page('![](assets/a.png)\n\n![](assets/b.gif)\n\n![](assets/c.webp)\n'), 'B/page.md': page('Rien.\n') });
    await fs.creerDossier('A/assets');
    await fs.creerDossier('B/assets');
    await fs.ecrireOctets('A/assets/a.png', png);
    await fs.ecrireOctets('A/assets/b.gif', gif);
    await fs.ecrireOctets('A/assets/c.webp', webp);
    await fs.ecrireOctets('A/assets/orpheline.png', png);
    await fs.ecrireOctets('B/assets/d.png', png);
    expect(await listerImagesAConvertir(fs)).toEqual([{ page: 'A', nom: 'a.png' }]);
  });

  it('ajoute la version WebP, met la page à jour et garde l’ancienne', async () => {
    const fs = MemoryLocalFs.depuis({ 'A/page.md': page('Avant.\n\n![x](assets/a.png#largeur=33)\n\nAprès.\n') });
    await fs.creerDossier('A/assets');
    await fs.ecrireOctets('A/assets/a.png', png);
    const adresse = await remplacerParWebp(contexteDeTest(fs), 'A', 'a.png', webp);
    expect(adresse).toBe('assets/a.webp');
    expect(fs.contenu()['A/page.md']).toBe(page('Avant.\n\n![x](assets/a.webp#largeur=33)\n\nAprès.\n'));
    expect(await fs.infos('A/assets/a.png')).not.toBeNull();
    expect(await fs.lireOctets('A/assets/a.webp')).toEqual(webp);
  });

  it('refuse des octets qui ne sont pas du WebP ou une page qui n’y renvoie plus, sans rien écrire', async () => {
    const fs = MemoryLocalFs.depuis({ 'A/page.md': page('![](assets/a.png)\n') });
    await fs.creerDossier('A/assets');
    await fs.ecrireOctets('A/assets/a.png', png);
    const avant = fs.ecritures;
    await expect(remplacerParWebp(contexteDeTest(fs), 'A', 'a.png', png)).rejects.toMatchObject({ code: 'chemin_invalide' });
    await expect(remplacerParWebp(contexteDeTest(fs), 'A', 'b.png', webp)).rejects.toMatchObject({ code: 'introuvable' });
    expect(fs.ecritures).toBe(avant);
  });
});
