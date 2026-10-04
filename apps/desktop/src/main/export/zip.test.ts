import { unzipSync, strFromU8, strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { creerArchive, estCheminDArchive } from './zip';

describe('creerArchive', () => {
  it('range les fichiers à leur chemin, arborescence comprise', () => {
    const archive = creerArchive([
      { chemin: 'Projets/Projets.md', octets: strToU8('# Projets\n') },
      { chemin: 'Projets/assets/schéma.webp', octets: new Uint8Array([1, 2, 3]) },
      { chemin: 'Projets/Refonte/Refonte.md', octets: strToU8('Texte') },
    ]);
    const fichiers = unzipSync(archive);
    expect(Object.keys(fichiers).sort()).toEqual(['Projets/Projets.md', 'Projets/Refonte/Refonte.md', 'Projets/assets/schéma.webp']);
    expect(strFromU8(fichiers['Projets/Projets.md'] as Uint8Array)).toBe('# Projets\n');
    expect([...(fichiers['Projets/assets/schéma.webp'] as Uint8Array)]).toEqual([1, 2, 3]);
  });

  it('refuse un chemin qui sortirait de l’archive ou un doublon', () => {
    expect(() => creerArchive([{ chemin: '../x.md', octets: new Uint8Array() }])).toThrow();
    expect(() => creerArchive([{ chemin: '/etc/x', octets: new Uint8Array() }])).toThrow();
    const un = { chemin: 'a.md', octets: new Uint8Array() };
    expect(() => creerArchive([un, un])).toThrow();
  });
});

describe('estCheminDArchive', () => {
  it('n’accepte que des chemins relatifs propres', () => {
    expect(estCheminDArchive('A/B/c.md')).toBe(true);
    for (const chemin of ['', 'a//b', './a', 'a/../b', 'a\\b', 'a\nb', '/a']) {
      expect(estCheminDArchive(chemin), chemin).toBe(false);
    }
  });
});
