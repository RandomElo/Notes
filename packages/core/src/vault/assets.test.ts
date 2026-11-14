import { describe, expect, it } from 'vitest';
import { versOctets } from '../fs/utf8';
import { MemoryLocalFs, contexteDeTest } from '../testing/memory-fs';
import { ajouterImage, ajouterPdf, listerFichiersInutilises, natureDImage, nomDeFichierDImage, pdfDeLaPage } from './assets';

const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const jpg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const enTete = '---\nid: 0199a0b0-0000-7000-8000-000000000001\ntitle: Alpha\n---\n';

describe('nature d’une image', () => {
  it('se lit dans les premiers octets', () => {
    expect(natureDImage(png)).toBe('png');
    expect(natureDImage(jpg)).toBe('jpg');
    expect(natureDImage(versOctets('GIF89a...'))).toBe('gif');
    expect(natureDImage(versOctets('RIFF\0\0\0\0WEBPVP8 '))).toBe('webp');
    expect(natureDImage(versOctets('\0\0\0\x1cftypavif'))).toBe('avif');
    expect(natureDImage(versOctets('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBe('svg');
  });

  it('refuse ce qui n’est pas une image, quel que soit son nom', () => {
    expect(natureDImage(versOctets('#!/bin/sh\necho'))).toBeNull();
    expect(natureDImage(versOctets('<html><svg></svg></html>'))).toBeNull();
    expect(natureDImage(new Uint8Array())).toBeNull();
  });
});

describe('nom d’une image copiée', () => {
  it('garde le nom d’origine sans ce qui gênerait dans un lien', () => {
    expect(nomDeFichierDImage('Capture d’écran (2).PNG', 'png', [], 0)).toBe('Capture-d’écran-2.png');
    expect(nomDeFichierDImage('a:b*c?.jpeg', 'jpg', [], 0)).toBe('a-b-c.jpg');
  });

  it('prend l’extension de la vraie nature du fichier', () => {
    expect(nomDeFichierDImage('photo.png', 'jpg', [], 0)).toBe('photo.jpg');
  });

  it('numérote un nom déjà pris, sans distinguer la casse', () => {
    expect(nomDeFichierDImage('schema.png', 'png', ['Schema.png', 'schema-2.png'], 0)).toBe('schema-3.png');
  });

  it('date une image collée', () => {
    // À l'heure du poste, comme les sauvegardes de conflit.
    const instant = new Date(2026, 9, 3, 14, 30, 5).getTime();
    expect(nomDeFichierDImage(null, 'png', [], instant)).toBe('image-2026-10-03-143005.png');
    expect(nomDeFichierDImage('...', 'png', [], instant)).toBe('image-2026-10-03-143005.png');
  });
});

describe('ajouterImage', () => {
  it('copie l’image dans assets/ et rend son adresse relative', async () => {
    const fs = MemoryLocalFs.depuis({ 'Alpha/page.md': enTete + 'corps\n' });
    const contexte = contexteDeTest(fs);
    expect(await ajouterImage(contexte, 'Alpha', 'schéma.png', png)).toBe('assets/sch%C3%A9ma.png');
    expect(await ajouterImage(contexte, 'Alpha', 'schéma.png', png)).toBe('assets/sch%C3%A9ma-2.png');
    expect(await fs.lireOctets('Alpha/assets/schéma.png')).toEqual(png);
  });

  it('refuse ce qui n’est pas une image et une page qui n’existe pas', async () => {
    const fs = MemoryLocalFs.depuis({ 'Alpha/page.md': enTete });
    const contexte = contexteDeTest(fs);
    await expect(ajouterImage(contexte, 'Alpha', 'x.png', versOctets('pas une image'))).rejects.toMatchObject({ code: 'chemin_invalide' });
    await expect(ajouterImage(contexte, 'Beta', 'x.png', png)).rejects.toMatchObject({ code: 'introuvable' });
    expect(await fs.infos('Alpha/assets')).toBeNull();
  });
});

describe('ajouterPdf et pdfDeLaPage', () => {
  const pdf = versOctets('%PDF-1.7\ncontenu');

  it('copie le PDF dans assets/ sous un nom libre et rend son adresse', async () => {
    const fs = MemoryLocalFs.depuis({ 'Alpha/page.md': enTete });
    const contexte = contexteDeTest(fs);
    expect(await ajouterPdf(contexte, 'Alpha', 'Cours n°1.pdf', pdf)).toBe('assets/Cours-n%C2%B01.pdf');
    expect(await ajouterPdf(contexte, 'Alpha', 'Cours n°1.pdf', pdf)).toBe('assets/Cours-n%C2%B01-2.pdf');
    expect(await fs.lireOctets('Alpha/assets/Cours-n°1.pdf')).toEqual(pdf);
  });

  it('refuse ce qui n’est pas un PDF', async () => {
    const fs = MemoryLocalFs.depuis({ 'Alpha/page.md': enTete });
    await expect(ajouterPdf(contexteDeTest(fs), 'Alpha', 'x.pdf', versOctets('<html>'))).rejects.toMatchObject({ code: 'chemin_invalide' });
  });

  it('reconnaît le lien d’un PDF de la page, et rien d’autre', () => {
    expect(pdfDeLaPage('assets/Cours-n%C2%B01.pdf')).toBe('Cours-n°1.pdf');
    expect(pdfDeLaPage('assets/../secret.pdf')).toBeNull();
    expect(pdfDeLaPage('assets/sous/x.pdf')).toBeNull();
    expect(pdfDeLaPage('assets/script.sh')).toBeNull();
    expect(pdfDeLaPage('https://exemple.fr/a.pdf')).toBeNull();
    expect(pdfDeLaPage('assets/%E0.pdf')).toBeNull();
  });
});

describe('listerFichiersInutilises', () => {
  it('liste les images et PDF auxquels leur page ne renvoie plus, avec leur taille', async () => {
    const fs = MemoryLocalFs.depuis({
      'Alpha/page.md': enTete + '![a](assets/utilisee.png)\n\n![b](assets/%C3%A9t%C3%A9.png#largeur=33)\n\n![c](assets/accent-écrit.png)\n',
      'Alpha/assets/utilisee.png': '',
      'Alpha/assets/été.png': '',
      'Alpha/assets/accent-écrit.png': '',
      'Alpha/assets/oubliee.png': '',
      'Alpha/assets/cours.pdf': '%PDF-1.7',
      'Alpha/assets/notes.txt': 'pas un fichier joint',
      'Alpha/Enfant/page.md': enTete,
      'Alpha/Enfant/assets/seule.jpg': '',
      '.trash/Vieux/assets/x.png': '',
    });
    const trouves = await listerFichiersInutilises(fs);
    expect(trouves.map(({ chemin, nature }) => [chemin, nature])).toEqual([
      ['Alpha/assets/cours.pdf', 'pdf'],
      ['Alpha/assets/oubliee.png', 'image'],
      ['Alpha/Enfant/assets/seule.jpg', 'image'],
    ]);
    expect(trouves[0]!.taille).toBe(8);
    expect(fs.ecritures).toBe(0);
  });
});
