import { cheminDeFavicon } from '@notes/core';
import { libelleDAdresse } from '@notes/document';
import { titreDeMentionDeSite } from '@notes/ui';
import type { Editor } from '@tiptap/core';
import { api } from '../../lib/ipc';
import { adresseDImage } from '../images/image-url';
import { liensVers, poserLien } from './link-commands';
import type { LinkRange } from './link-commands';

/** Côté de la favicon gardée : nette jusqu'à quatre fois la taille du texte. */
const coteDeLaFavicon = 64;

/** Favicon (PNG, JPEG, ICO…) ramenée à un PNG carré, par le moteur d'images de la fenêtre. null si elle ne se lit pas. */
async function versPng(octets: Uint8Array): Promise<Uint8Array | null> {
  try {
    const image = await createImageBitmap(new Blob([octets as BlobPart]));
    const toile = new OffscreenCanvas(coteDeLaFavicon, coteDeLaFavicon);
    toile.getContext('2d')?.drawImage(image, 0, 0, coteDeLaFavicon, coteDeLaFavicon);
    image.close();
    return new Uint8Array(await (await toile.convertToBlob({ type: 'image/png' })).arrayBuffer());
  } catch {
    return null;
  }
}

/** Adresse de la favicon gardée pour le site d'un lien, servie par le main. null si le lien n'a pas de site. */
export function adresseDeFavicon(href: string): string | null {
  try {
    const chemin = cheminDeFavicon(new URL(href).hostname);
    return chemin === null ? null : adresseDImage('', chemin);
  } catch {
    return null;
  }
}

/**
 * Fait des liens vers « adresse » choisis par « garder » des mentions de site
 * (README §6) : titre et favicon du site, demandés par le main. La favicon est
 * gardée dans le dossier des notes. Rend le message d'erreur, null si c'est fait.
 */
export async function mentionnerLeSite(editor: Editor, adresse: string, garder: (lien: LinkRange) => boolean): Promise<string | null> {
  const apercu = await api.apercuDuSite({ adresse });
  if (!apercu.ok || apercu.titre === null) {
    return apercu.ok ? "Le site n'a pas de titre : le lien reste un lien." : apercu.message;
  }
  if (apercu.favicon !== null) {
    const png = await versPng(apercu.favicon);
    if (png !== null) {
      await api.enregistrerFavicon({ hote: new URL(adresse).hostname, octets: png });
    }
  }
  if (editor.isDestroyed) {
    return null;
  }
  // De la fin vers le début : chaque remplacement laisse en place les positions des liens précédents.
  for (const lien of liensVers(editor.state, adresse).filter(garder).reverse()) {
    editor.view.dispatch(poserLien(editor.state, lien, apercu.titre, adresse, titreDeMentionDeSite));
  }
  return null;
}

/** Ramène une mention de site à un simple lien, au texte de l'adresse nettoyée. */
export function afficherEnLien(editor: Editor, lien: LinkRange): void {
  editor.view.dispatch(poserLien(editor.state, lien, libelleDAdresse(lien.adresse), lien.adresse));
}
