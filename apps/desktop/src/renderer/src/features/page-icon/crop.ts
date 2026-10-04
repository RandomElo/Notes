/** Côté de l'aperçu du recadrage, en pixels d'écran. */
export const tailleDeLApercu = 224;
/** Côté de l'icône enregistrée (README §6). */
export const tailleDeLIcone = 128;
const zoomMax = 4;

/**
 * Carré choisi dans l'image : son centre, en pixels de l'image, et le zoom.
 * Au zoom 1, le carré a pour côté le plus petit côté de l'image.
 */
export interface Crop {
  cx: number;
  cy: number;
  zoom: number;
}

const borner = (valeur: number, min: number, max: number): number => Math.min(max, Math.max(min, valeur));

/** Le carré garde son centre assez loin des bords pour rester dans l'image. */
function contenir({ cx, cy, zoom }: Crop, largeur: number, hauteur: number): Crop {
  const z = borner(zoom, 1, zoomMax);
  const demi = Math.min(largeur, hauteur) / z / 2;
  return { cx: borner(cx, demi, largeur - demi), cy: borner(cy, demi, hauteur - demi), zoom: z };
}

/** Le plus grand carré, au centre de l'image. */
export function cadrageInitial(largeur: number, hauteur: number): Crop {
  return { cx: largeur / 2, cy: hauteur / 2, zoom: 1 };
}

/** Rectangle à prendre dans l'image : coin haut gauche et côté, en pixels de l'image. */
export function rectangleSource(cadrage: Crop, largeur: number, hauteur: number): { x: number; y: number; cote: number } {
  const { cx, cy, zoom } = contenir(cadrage, largeur, hauteur);
  const cote = Math.min(largeur, hauteur) / zoom;
  return { x: cx - cote / 2, y: cy - cote / 2, cote };
}

/** L'image suit la souris : un glissement de (dx, dy) pixels d'aperçu vers la droite montre ce qui est à gauche. */
export function deplacer(cadrage: Crop, dx: number, dy: number, largeur: number, hauteur: number): Crop {
  const parPixel = Math.min(largeur, hauteur) / cadrage.zoom / tailleDeLApercu;
  return contenir({ ...cadrage, cx: cadrage.cx - dx * parPixel, cy: cadrage.cy - dy * parPixel }, largeur, hauteur);
}

/** Zoom multiplié par « facteur », autour du centre du carré, entre 1 et 4. */
export function zoomer(cadrage: Crop, facteur: number, largeur: number, hauteur: number): Crop {
  return contenir({ ...cadrage, zoom: cadrage.zoom * facteur }, largeur, hauteur);
}
