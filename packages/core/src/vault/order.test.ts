import { describe, expect, it } from 'vitest';
import { MemoryLocalFs } from '../testing/memory-fs';
import { ecrireOrdre, lireOrdre } from './order';

const a = '0199a0b0-0000-7000-8000-00000000000a';
const b = '0199a0b0-0000-7000-8000-00000000000b';

describe('ordre manuel', () => {
  it('rend une liste vide sans fichier', async () => {
    expect(await lireOrdre(new MemoryLocalFs(), '')).toEqual([]);
  });

  it('écrit un identifiant par ligne et le relit', async () => {
    const fs = MemoryLocalFs.depuis({ 'Projets/page.md': '' });
    await ecrireOrdre(fs, 'Projets', [b, a]);
    expect(fs.contenu()['Projets/.order']).toBe(`${b}\n${a}\n`);
    expect(await lireOrdre(fs, 'Projets')).toEqual([b, a]);
  });

  it('ignore lignes invalides, doublons et fins de ligne Windows', async () => {
    const fs = MemoryLocalFs.depuis({ '.order': `${a}\r\n\r\npas un id\r\n${b}\r\n${a}\r\n` });
    expect(await lireOrdre(fs, '')).toEqual([a, b]);
  });

  it('supprime le fichier quand il ne reste plus d’enfant', async () => {
    const fs = MemoryLocalFs.depuis({ '.order': `${a}\n` });
    await ecrireOrdre(fs, '', []);
    expect(fs.contenu()).toEqual({});
  });
});
