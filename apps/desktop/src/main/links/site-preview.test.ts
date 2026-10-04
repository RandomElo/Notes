import { describe, expect, it } from 'vitest';
import { apercuDuSite } from './site-preview';

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

/** Un faux réseau : une réponse par adresse. */
function reseau(reponses: Record<string, () => Response>) {
  const demandees: string[] = [];
  const recuperer = async (adresse: string) => {
    demandees.push(adresse);
    const reponse = reponses[adresse];
    if (reponse === undefined) {
      throw new Error('injoignable');
    }
    return reponse();
  };
  return { recuperer, demandees };
}

describe('aperçu d’un site', () => {
  it('rend le titre et la première favicon lisible', async () => {
    const { recuperer, demandees } = reseau({
      'https://exemple.fr/': () => new Response('<title>Exemple</title><link rel="icon" href="/cassee.png"><link rel="icon" href="/bonne.png">', { headers: { 'content-type': 'text/html; charset=utf-8' } }),
      'https://exemple.fr/cassee.png': () => new Response('pas une image'),
      'https://exemple.fr/bonne.png': () => new Response(png),
    });
    const apercu = await apercuDuSite('https://exemple.fr/', recuperer);
    expect(apercu).toEqual({ ok: true, titre: 'Exemple', favicon: png });
    expect(demandees).toEqual(['https://exemple.fr/', 'https://exemple.fr/cassee.png', 'https://exemple.fr/bonne.png']);
  });

  it('refuse ce qui n’est pas une page web, sans réseau ou hors http', async () => {
    const { recuperer } = reseau({ 'https://exemple.fr/x.pdf': () => new Response('%PDF', { headers: { 'content-type': 'application/pdf' } }) });
    expect(await apercuDuSite('https://exemple.fr/x.pdf', recuperer)).toMatchObject({ ok: false });
    expect(await apercuDuSite('https://ailleurs.fr/', recuperer)).toMatchObject({ ok: false, message: 'Le site ne répond pas.' });
    expect(await apercuDuSite('file:///etc/passwd', recuperer)).toMatchObject({ ok: false });
  });

  it('sans favicon trouvée, la mention garde son titre', async () => {
    const { recuperer } = reseau({ 'https://exemple.fr/': () => new Response('<title>Exemple</title>', { headers: { 'content-type': 'text/html' } }) });
    expect(await apercuDuSite('https://exemple.fr/', recuperer)).toEqual({ ok: true, titre: 'Exemple', favicon: null });
  });
});
