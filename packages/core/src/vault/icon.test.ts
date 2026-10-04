import { describe, expect, it } from 'vitest';
import { MemoryLocalFs, contexteDeTest } from '../testing/memory-fs';
import { listerImagesOrphelines } from './assets';
import { ajouterIconeImage, changerIcone } from './icon';
import { lireArbre } from './tree';

const enTete = '---\nid: 0199a0b0-0000-7000-8000-000000000001\ntitle: Alpha\n# commentaire gardé\ncreated: 2026-01-01T00:00:00.000Z\nupdated: 2026-01-01T00:00:00.000Z\n---\ncorps\n';
const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20]);

function monter() {
  const fs = MemoryLocalFs.depuis({ 'Alpha/page.md': enTete });
  return { fs, contexte: contexteDeTest(fs) };
}

describe('icône de page', () => {
  it('change, garde le reste du front-matter, puis retire', async () => {
    const { fs, contexte } = monter();
    await changerIcone(contexte, 'Alpha', 'book-open');
    expect((await lireArbre(fs))[0]?.icone).toBe('book-open');
    expect(await fs.lireTexte('Alpha/page.md')).toContain('# commentaire gardé');
    await changerIcone(contexte, 'Alpha', null);
    expect((await lireArbre(fs))[0]?.icone).toBeNull();
    expect(await fs.lireTexte('Alpha/page.md')).toMatch(/corps\n$/);
  });

  it('refuse ce qui n’est pas une icône', async () => {
    const { contexte } = monter();
    await expect(changerIcone(contexte, 'Alpha', '<b>x</b>')).rejects.toMatchObject({ code: 'chemin_invalide' });
  });

  it('copie une icône image sans remplacer, et l’ancienne devient inutilisée', async () => {
    const { fs, contexte } = monter();
    await ajouterIconeImage(contexte, 'Alpha', webp);
    expect((await lireArbre(fs))[0]?.icone).toBe('assets/icone.webp');
    expect(await listerImagesOrphelines(fs)).toEqual([]);
    await ajouterIconeImage(contexte, 'Alpha', webp);
    expect((await lireArbre(fs))[0]?.icone).toBe('assets/icone-2.webp');
    expect(await listerImagesOrphelines(fs)).toEqual(['Alpha/assets/icone.webp']);
  });
});
