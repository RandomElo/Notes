import { describe, expect, it } from 'vitest';
import { MemoryLocalFs, contexteDeTest } from '../testing/memory-fs';
import { ajouterAuDictionnaire, lireDictionnaire, motValide, motsDuDictionnaire } from './dictionary';

describe('dictionnaire personnel', () => {
  it('lit un mot par ligne, sans commentaires, lignes vides ni doublons', () => {
    expect(motsDuDictionnaire('\uFEFF# mes mots\nSequelize\r\n\n  Vitest  \nSequelize\n')).toEqual(['Sequelize', 'Vitest']);
  });

  it('refuse un mot vide, trop long, sur deux lignes ou pris pour un commentaire', () => {
    expect(motValide('  TipTap ')).toBe('TipTap');
    expect(motValide('')).toBeNull();
    expect(motValide('a\nb')).toBeNull();
    expect(motValide('#mot')).toBeNull();
    expect(motValide('x'.repeat(101))).toBeNull();
  });

  it('ajoute à la fin sans toucher au reste, une seule fois', async () => {
    const fs = MemoryLocalFs.depuis({ '.notes/dictionary.txt': '# à moi\nSequelize' });
    const contexte = contexteDeTest(fs);
    expect(await ajouterAuDictionnaire(contexte, 'Vitest')).toEqual(['Sequelize', 'Vitest']);
    expect(await fs.lireTexte('.notes/dictionary.txt')).toBe('# à moi\nSequelize\nVitest\n');
    const ecritures = fs.ecritures;
    await ajouterAuDictionnaire(contexte, 'Vitest');
    expect(fs.ecritures).toBe(ecritures);
  });

  it('crée le fichier au premier mot', async () => {
    const fs = MemoryLocalFs.depuis({});
    const contexte = contexteDeTest(fs);
    expect(await lireDictionnaire(contexte)).toEqual([]);
    await ajouterAuDictionnaire(contexte, 'Eloi');
    expect(await fs.lireTexte('.notes/dictionary.txt')).toBe('Eloi\n');
  });

  it('garde les mots des versions mises de côté par la sync', async () => {
    const fs = MemoryLocalFs.depuis({
      '.notes/dictionary.txt': 'Sequelize\n',
      '.notes/dictionary.conflit-2026-10-04-101500.txt': 'Sequelize\nVitest\n',
      '.notes/theme.toml': '',
    });
    expect(await lireDictionnaire(contexteDeTest(fs))).toEqual(['Sequelize', 'Vitest']);
  });
});
