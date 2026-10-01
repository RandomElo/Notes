import { joindreChemins } from '../fs/paths';
import type { LocalFs } from '../fs/local-fs';
import { estId } from '../page/id';

/** Fichier qui porte l'ordre manuel des pages enfants d'un dossier : un identifiant par ligne. */
export const fichierOrdre = '.order';

/** Identifiants dans l'ordre voulu. Liste vide si le fichier manque ; les lignes invalides sont ignorées. */
export async function lireOrdre(fs: LocalFs, dossier: string): Promise<string[]> {
  const chemin = joindreChemins(dossier, fichierOrdre);
  if ((await fs.infos(chemin)) === null) {
    return [];
  }
  const vus = new Set<string>();
  for (const ligne of (await fs.lireTexte(chemin)).split(/\r?\n/)) {
    const id = ligne.trim();
    if (estId(id)) {
      vus.add(id);
    }
  }
  return [...vus];
}

/** Écrit l'ordre. Une liste vide supprime le fichier : pas d'enfant, pas de `.order`. */
export async function ecrireOrdre(fs: LocalFs, dossier: string, ids: readonly string[]): Promise<void> {
  const chemin = joindreChemins(dossier, fichierOrdre);
  if (ids.length === 0) {
    if ((await fs.infos(chemin)) !== null) {
      await fs.supprimer(chemin);
    }
    return;
  }
  await fs.ecrireTexte(chemin, `${ids.join('\n')}\n`);
}
