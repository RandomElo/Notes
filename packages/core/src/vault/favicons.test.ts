import { describe, expect, it } from 'vitest';
import { MemoryLocalFs, contexteDeTest } from '../testing/memory-fs';
import { cheminDeFavicon, enregistrerFavicon } from './favicons';

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

describe('favicons', () => {
  it('nomme la favicon par le site', () => {
    expect(cheminDeFavicon('WWW.Google.com')).toBe('.notes/favicons/google.com.png');
    expect(cheminDeFavicon('fr.wikipedia.org')).toBe('.notes/favicons/fr.wikipedia.org.png');
    expect(cheminDeFavicon('../x')).toBeNull();
    expect(cheminDeFavicon('a/b')).toBeNull();
  });

  it('enregistre une seule fois, et seulement un PNG', async () => {
    const fs = MemoryLocalFs.depuis({});
    const contexte = contexteDeTest(fs);
    expect(await enregistrerFavicon(contexte, 'exemple.fr', png)).toBe('.notes/favicons/exemple.fr.png');
    const ecritures = fs.ecritures;
    await enregistrerFavicon(contexte, 'exemple.fr', png);
    expect(fs.ecritures).toBe(ecritures);
    await expect(enregistrerFavicon(contexte, 'exemple.fr', new Uint8Array([1, 2, 3]))).rejects.toMatchObject({ code: 'chemin_invalide' });
  });
});
