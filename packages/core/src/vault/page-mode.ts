import { cheminDuFichierPage, modifierMetaDansTexte } from '../page/page-file';
import type { PageMode } from '../page/types';
import type { VaultContext } from './context';
import { chargerPage, dateIso } from './operations';
import type { PageLocation } from './operations';

/**
 * Passe une page en mode liste de tâches (`mode: todo`) ou la ramène en page
 * classique (null). Seul le front-matter change : le corps reste celui de la
 * page, c'est l'éditeur qui en convertit les blocs (docs/spec/liste-de-taches.md).
 */
export async function changerMode(contexte: VaultContext, chemin: string, mode: PageMode | null): Promise<PageLocation> {
  const { texte, meta } = await chargerPage(contexte.fs, chemin);
  if (meta.mode !== mode) {
    await contexte.fs.ecrireTexte(cheminDuFichierPage(chemin), modifierMetaDansTexte(texte, { mode, modifieLe: dateIso(contexte) }));
  }
  return { chemin, id: meta.id };
}
