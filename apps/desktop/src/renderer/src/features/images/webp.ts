import { natureDImage, naturesAConvertir, nomEnWebp } from '@notes/core';

/** Largeur maximale d'une image enregistrée (choix d'Eloi) : au-delà, elle est réduite, proportions gardées. */
export const largeurMaxEnregistree = 1920;
/** Qualité de la compression WebP (choix d'Eloi). */
export const qualiteWebp = 0.82;

/** Dimensions après réduction : la largeur ramenée à « largeurMax » au plus, jamais agrandie. */
export function dimensionsReduites(largeur: number, hauteur: number, largeurMax = largeurMaxEnregistree): { largeur: number; hauteur: number } {
  if (largeur <= largeurMax) {
    return { largeur, hauteur };
  }
  return { largeur: largeurMax, hauteur: Math.max(1, Math.round((hauteur * largeurMax) / largeur)) };
}

export interface ImageFile {
  nom: string | null;
  octets: Uint8Array;
}

/**
 * Une image en WebP compressé (docs/spec/editeur.md) : décodée et réencodée par le moteur
 * d'images de Chromium, réduite à 1920 px de large. Un GIF ou un SVG reste
 * tel quel, comme une image que le moteur ne sait pas lire. Un WebP déjà plus
 * léger que sa version réencodée est gardé.
 */
export async function versWebp(fichier: ImageFile): Promise<ImageFile> {
  const nature = natureDImage(fichier.octets);
  if (nature === null || !naturesAConvertir.includes(nature)) {
    return fichier;
  }
  try {
    const image = await createImageBitmap(new Blob([fichier.octets as BlobPart]));
    const { largeur, hauteur } = dimensionsReduites(image.width, image.height);
    const toile = new OffscreenCanvas(largeur, hauteur);
    toile.getContext('2d')?.drawImage(image, 0, 0, largeur, hauteur);
    const reduite = largeur !== image.width;
    image.close();
    const octets = new Uint8Array(await (await toile.convertToBlob({ type: 'image/webp', quality: qualiteWebp })).arrayBuffer());
    if (natureDImage(octets) !== 'webp' || (nature === 'webp' && !reduite && octets.length >= fichier.octets.length)) {
      return fichier;
    }
    return { nom: nomEnWebp(fichier.nom), octets };
  } catch {
    // Une image que le moteur ne sait pas décoder est gardée telle quelle : le main vérifie encore sa nature.
    return fichier;
  }
}
