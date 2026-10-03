import { natureDImage, tailleMaxAvantConversion } from '@notes/core';

/** Délai au-delà duquel un téléchargement est abandonné : l'édition n'attend jamais le réseau. */
export const delaiDeTelechargementMs = 20_000;

export type DownloadResult = { ok: true; nom: string | null; octets: Uint8Array } | { ok: false; message: string };

/** Ce que le téléchargement demande au réseau : `net.fetch` d'Electron, ou un faux dans les tests. */
export type Recuperer = (adresse: string, options: { signal: AbortSignal; redirect: 'follow'; credentials: 'omit' }) => Promise<Response>;

/** Nom du fichier dans l'adresse (`schema.png`), null s'il n'y en a pas. */
function nomDansLAdresse(url: URL): string | null {
  const dernier = url.pathname.split('/').pop() ?? '';
  try {
    const nom = decodeURIComponent(dernier).trim();
    return nom === '' ? null : nom;
  } catch {
    return null;
  }
}

/**
 * Télécharge une image d'Internet que l'utilisateur a collée et accepté de
 * garder dans la page (README §6). Seulement http et https, sans cookies,
 * dans un délai et une taille bornés. Les octets doivent être ceux d'une
 * image reconnue : ce que dit le serveur ne suffit pas.
 */
export async function telechargerImage(adresse: string, recuperer: Recuperer, delaiMs = delaiDeTelechargementMs): Promise<DownloadResult> {
  let url: URL;
  try {
    url = new URL(adresse);
  } catch {
    return { ok: false, message: "Ce lien n'est pas une adresse valide." };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, message: 'Seuls les liens http et https se téléchargent.' };
  }
  let reponse: Response;
  try {
    reponse = await recuperer(url.href, { signal: AbortSignal.timeout(delaiMs), redirect: 'follow', credentials: 'omit' });
  } catch {
    return { ok: false, message: "le site ne répond pas (pas de réseau, ou adresse injoignable)." };
  }
  if (!reponse.ok) {
    return { ok: false, message: `le site a répondu ${reponse.status}.` };
  }
  const annoncee = Number(reponse.headers.get('content-length'));
  const tropGrande = `l'image dépasse ${tailleMaxAvantConversion / 1024 / 1024} Mo.`;
  if (annoncee > tailleMaxAvantConversion) {
    return { ok: false, message: tropGrande };
  }
  // La taille annoncée peut mentir : la lecture s'arrête dès que la limite est dépassée.
  const morceaux: Uint8Array[] = [];
  let taille = 0;
  try {
    const lecteur = reponse.body?.getReader();
    while (lecteur !== undefined) {
      const { done, value } = await lecteur.read();
      if (done) {
        break;
      }
      taille += value.length;
      if (taille > tailleMaxAvantConversion) {
        await lecteur.cancel();
        return { ok: false, message: tropGrande };
      }
      morceaux.push(value);
    }
  } catch {
    return { ok: false, message: 'le téléchargement a été interrompu.' };
  }
  const octets = new Uint8Array(taille);
  let decalage = 0;
  for (const morceau of morceaux) {
    octets.set(morceau, decalage);
    decalage += morceau.length;
  }
  if (natureDImage(octets) === null) {
    return { ok: false, message: "ce lien ne mène pas à une image (PNG, JPEG, GIF, WebP, AVIF ou SVG)." };
  }
  return { ok: true, nom: nomDansLAdresse(url), octets };
}
