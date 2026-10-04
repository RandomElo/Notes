/** Préparation de l'entrée et lecture de la sortie du modèle de détourage, sans dépendance : testées seules. */

/** Côté de l'image attendue par le modèle silueta. */
export const coteDuModele = 320;

const moyennes = [0.485, 0.456, 0.406] as const;
const ecarts = [0.229, 0.224, 0.225] as const;

/** Pixels RGBA d'un carré vers le tenseur du modèle : trois plans R, V, B, normalisés comme à l'entraînement. */
export function versTenseur(pixels: Uint8Array, cote: number): Float32Array {
  const surface = cote * cote;
  const tenseur = new Float32Array(3 * surface);
  for (let i = 0; i < surface; i++) {
    for (let canal = 0; canal < 3; canal++) {
      tenseur[canal * surface + i] = ((pixels[i * 4 + canal] as number) / 255 - (moyennes[canal] as number)) / (ecarts[canal] as number);
    }
  }
  return tenseur;
}

/** Sortie du modèle (une carte de premier plan) vers un masque de 0 (fond) à 255 (sujet), étalé sur toute la plage. */
export function versMasque(sortie: Float32Array): Uint8Array {
  let min = Infinity;
  let max = -Infinity;
  for (const valeur of sortie) {
    min = Math.min(min, valeur);
    max = Math.max(max, valeur);
  }
  const etendue = max - min || 1;
  return Uint8Array.from(sortie, (valeur) => Math.round(((valeur - min) / etendue) * 255));
}
