import { natureDImage } from '@notes/core';
import type { Recuperer } from '../images/download';
import { adressesDeFavicon, estUneIco, titreDeLaPage } from './site-page';

export type SitePreview = { ok: true; titre: string | null; favicon: Uint8Array | null } | { ok: false; message: string };

const tailleMaxDeLaPage = 512 * 1024;
const tailleMaxDeLaFavicon = 256 * 1024;
const essaisDeFavicon = 3;

/** Lit au plus « max » octets de la réponse : une page plus longue est coupée, son début suffit. null si la lecture échoue. */
async function lireAuPlus(reponse: Response, max: number, couper: boolean): Promise<Uint8Array | null> {
  const morceaux: Uint8Array[] = [];
  let taille = 0;
  try {
    const lecteur = reponse.body?.getReader();
    while (lecteur !== undefined) {
      const { done, value } = await lecteur.read();
      if (done) {
        break;
      }
      morceaux.push(value);
      taille += value.length;
      if (taille >= max) {
        await lecteur.cancel();
        if (!couper) {
          return null;
        }
        break;
      }
    }
  } catch {
    return null;
  }
  const octets = new Uint8Array(Math.min(taille, max));
  let decalage = 0;
  for (const morceau of morceaux) {
    const reste = octets.length - decalage;
    if (reste <= 0) {
      break;
    }
    octets.set(morceau.subarray(0, reste), decalage);
    decalage += Math.min(morceau.length, reste);
  }
  return octets;
}

/** Texte d'une page selon le jeu de caractères annoncé (UTF-8 par défaut). */
function decoder(octets: Uint8Array, typeDeContenu: string): string {
  const jeu = /charset=["']?([\w-]+)/i.exec(typeDeContenu)?.[1] ?? 'utf-8';
  try {
    return new TextDecoder(jeu).decode(octets);
  } catch {
    return new TextDecoder('utf-8').decode(octets);
  }
}

/**
 * Titre et favicon d'un site, pour une mention de site (README §6). Seulement
 * http et https, sans cookies, délai et taille bornés. La favicon doit être
 * une image reconnue par ses premiers octets (PNG, JPEG, GIF, WebP, AVIF ou
 * ICO) : le renderer la convertit en PNG. Sans titre, la mention n'a pas lieu.
 */
export async function apercuDuSite(adresse: string, recuperer: Recuperer, delaiMs = 8000): Promise<SitePreview> {
  let url: URL;
  try {
    url = new URL(adresse);
  } catch {
    return { ok: false, message: "Ce lien n'est pas une adresse valide." };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, message: 'Seuls les liens http et https deviennent des mentions.' };
  }
  let reponse: Response;
  try {
    reponse = await recuperer(url.href, { signal: AbortSignal.timeout(delaiMs), redirect: 'follow', credentials: 'omit' });
  } catch {
    return { ok: false, message: 'Le site ne répond pas.' };
  }
  const type = reponse.headers.get('content-type') ?? '';
  if (!reponse.ok || !/html/i.test(type)) {
    void reponse.body?.cancel();
    return { ok: false, message: reponse.ok ? "Ce lien ne mène pas à une page web." : `Le site a répondu ${reponse.status}.` };
  }
  const page = await lireAuPlus(reponse, tailleMaxDeLaPage, true);
  if (page === null) {
    return { ok: false, message: 'La page a été interrompue.' };
  }
  const html = decoder(page, type);
  const pageFinale = reponse.url === '' ? url.href : reponse.url;

  let favicon: Uint8Array | null = null;
  for (const lien of adressesDeFavicon(html, pageFinale).slice(0, essaisDeFavicon)) {
    try {
      const icone = await recuperer(lien, { signal: AbortSignal.timeout(delaiMs), redirect: 'follow', credentials: 'omit' });
      if (!icone.ok) {
        void icone.body?.cancel();
        continue;
      }
      const octets = await lireAuPlus(icone, tailleMaxDeLaFavicon, false);
      const nature = octets === null ? null : natureDImage(octets);
      if (octets !== null && ((nature !== null && nature !== 'svg') || estUneIco(octets))) {
        favicon = octets;
        break;
      }
    } catch {
      // Favicon injoignable : on essaie la suivante, et à défaut la mention n'en a pas.
    }
  }
  return { ok: true, titre: titreDeLaPage(html), favicon };
}
