import { joindreChemins } from '../fs/paths';
import { natureDImage } from './assets';
import { VaultError } from './context';
import type { VaultContext } from './context';

/**
 * Favicons des mentions de site (docs/spec/editeur.md) : une image PNG par site, dans
 * `.notes/favicons/`, gardée une fois pour toutes et synchronisée avec le
 * reste. L'affichage ne va jamais la chercher sur Internet.
 */
export const dossierFavicons = '.notes/favicons';
const tailleMax = 256 * 1024;

/** Chemin de la favicon d'un site (`exemple.fr` donne `.notes/favicons/exemple.fr.png`), null pour un nom de site invalide. */
export function cheminDeFavicon(hote: string): string | null {
  const nom = hote.trim().toLowerCase().replace(/^www\./, '');
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(nom) || nom.length > 200) {
    return null;
  }
  return joindreChemins(dossierFavicons, `${nom}.png`);
}

/** Enregistre la favicon d'un site, une image PNG. Celle déjà gardée n'est pas remplacée. Rend son chemin. */
export async function enregistrerFavicon(contexte: VaultContext, hote: string, octets: Uint8Array): Promise<string> {
  const chemin = cheminDeFavicon(hote);
  if (chemin === null) {
    throw new VaultError('chemin_invalide', "Ce nom de site n'est pas accepté.");
  }
  if (octets.length === 0 || octets.length > tailleMax || natureDImage(octets) !== 'png') {
    throw new VaultError('chemin_invalide', "Cette favicon n'est pas une image PNG.");
  }
  if ((await contexte.fs.infos(chemin)) === null) {
    await contexte.fs.creerDossier(dossierFavicons);
    await contexte.fs.ecrireOctets(chemin, octets);
  }
  return chemin;
}
