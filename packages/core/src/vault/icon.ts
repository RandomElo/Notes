import { natureDIcone } from '../page/icon';
import { cheminDuFichierPage, modifierMetaDansTexte } from '../page/page-file';
import { ajouterImage } from './assets';
import { VaultError } from './context';
import type { VaultContext } from './context';
import { chargerPage, dateIso } from './operations';
import type { PageLocation } from './operations';

/** Change l'icône d'une page, ou la retire (null). Une valeur qui n'est pas une icône est refusée. */
export async function changerIcone(contexte: VaultContext, chemin: string, icone: string | null): Promise<PageLocation> {
  const valeur = icone === null ? null : icone.trim();
  if (valeur !== null && natureDIcone(valeur) === null) {
    throw new VaultError('chemin_invalide', "Cette icône n'est pas reconnue.");
  }
  const { texte, meta } = await chargerPage(contexte.fs, chemin);
  if ((meta.icone ?? null) !== valeur) {
    await contexte.fs.ecrireTexte(cheminDuFichierPage(chemin), modifierMetaDansTexte(texte, { icone: valeur, modifieLe: dateIso(contexte) }));
  }
  return { chemin, id: meta.id };
}

/**
 * Icône image : l'image, déjà recadrée par l'application, est copiée dans le
 * dossier `assets/` de la page (sans rien remplacer), puis devient son icône.
 * L'ancienne icône image reste dans `assets/` et passe dans les images inutilisées.
 */
export async function ajouterIconeImage(contexte: VaultContext, chemin: string, octets: Uint8Array): Promise<PageLocation> {
  const adresse = await ajouterImage(contexte, chemin, 'icone.webp', octets);
  // Le nom est assaini à l'ajout : « icone.webp », « icone-2.webp »... sans caractère à encoder.
  return changerIcone(contexte, chemin, decodeURIComponent(adresse));
}
