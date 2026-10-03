import { describe, expect, it } from 'vitest';
import { telechargerImage } from './download';
import type { Recuperer } from './download';

/** Un PNG minimal : sa signature suffit à le reconnaître. */
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]);

const repondre = (corps: ConstructorParameters<typeof Response>[0], init?: ResponseInit): Recuperer => async () => new Response(corps, init);

describe('téléchargement d’une image collée', () => {
  it('rend les octets et le nom du fichier de l’adresse', async () => {
    const vus: { adresse: string; credentials: string }[] = [];
    const recuperer: Recuperer = async (adresse, options) => {
      vus.push({ adresse, credentials: options.credentials });
      return new Response(png);
    };
    const resultat = await telechargerImage('https://example.com/dossier/sch%C3%A9ma.png?v=2', recuperer);
    expect(resultat).toEqual({ ok: true, nom: 'schéma.png', octets: png });
    expect(vus).toEqual([{ adresse: 'https://example.com/dossier/sch%C3%A9ma.png?v=2', credentials: 'omit' }]);
  });

  it('refuse ce qui n’est pas http ou https, sans rien demander au réseau', async () => {
    let appels = 0;
    const recuperer: Recuperer = async () => {
      appels++;
      return new Response(png);
    };
    for (const adresse of ['file:///etc/passwd', 'notes-asset://vault/a.png', 'javascript:alert(1)', 'pas une adresse']) {
      expect((await telechargerImage(adresse, recuperer)).ok).toBe(false);
    }
    expect(appels).toBe(0);
  });

  it('refuse ce qui n’est pas une image, quoi qu’en dise le serveur', async () => {
    const resultat = await telechargerImage('https://example.com/a.png', repondre('<html>', { headers: { 'content-type': 'image/png' } }));
    expect(resultat).toMatchObject({ ok: false, message: expect.stringContaining('pas à une image') });
  });

  it('rend un message sans réseau, sur une erreur du site ou une image trop grande', async () => {
    const injoignable: Recuperer = async () => {
      throw new TypeError('fetch failed');
    };
    expect(await telechargerImage('https://example.com/a.png', injoignable)).toMatchObject({ ok: false, message: expect.stringContaining('ne répond pas') });
    expect(await telechargerImage('https://example.com/a.png', repondre(null, { status: 404 }))).toMatchObject({ ok: false, message: expect.stringContaining('404') });
    const annoncee = repondre(png, { headers: { 'content-length': String(300 * 1024 * 1024) } });
    expect(await telechargerImage('https://example.com/a.png', annoncee)).toMatchObject({ ok: false, message: expect.stringContaining('Mo') });
  });

  it('abandonne un site qui ne répond pas dans le délai', async () => {
    const lent: Recuperer = (_adresse, { signal }) =>
      new Promise((_resoudre, rejeter) => signal.addEventListener('abort', () => rejeter(signal.reason as Error)));
    expect((await telechargerImage('https://example.com/a.png', lent, 20)).ok).toBe(false);
  });
});
