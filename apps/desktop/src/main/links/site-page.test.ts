import { describe, expect, it } from 'vitest';
import { adressesDeFavicon, estUneIco, titreDeLaPage } from './site-page';

describe('page d’un site', () => {
  it('lit le titre, og:title d’abord', () => {
    expect(titreDeLaPage('<html><head><title>  Le   Monde &amp; Co &#233;\n</title></head>')).toBe('Le Monde & Co é');
    expect(titreDeLaPage('<title>x</title><meta property="og:title" content="Titre &quot;OG&quot;">')).toBe('Titre "OG"');
    expect(titreDeLaPage('<p>rien</p>')).toBeNull();
    expect(titreDeLaPage('<title><script>alert(1)</script></title>')).toBe('<script>alert(1)</script>');
  });

  it('classe les favicons, la plus grande d’abord, /favicon.ico en dernier', () => {
    const html = `<link rel="icon" href="/petit.png" sizes="16x16"><link rel="shortcut icon" href='//cdn.exemple.fr/grand.png' sizes="64x64">
      <link rel="apple-touch-icon" href="pomme.png"><link rel="icon" href="logo.svg" type="image/svg+xml"><link rel="icon" href="javascript:x">`;
    expect(adressesDeFavicon(html, 'https://exemple.fr/a/b')).toEqual([
      'https://cdn.exemple.fr/grand.png',
      'https://exemple.fr/petit.png',
      'https://exemple.fr/a/pomme.png',
      'https://exemple.fr/a/logo.svg',
      'https://exemple.fr/favicon.ico',
    ]);
  });

  it('reconnaît une ico', () => {
    expect(estUneIco(new Uint8Array([0, 0, 1, 0, 1]))).toBe(true);
    expect(estUneIco(new Uint8Array([0x89, 0x50]))).toBe(false);
  });
});
