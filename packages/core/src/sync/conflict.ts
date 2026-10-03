import type { LocalFs } from '../fs/local-fs';
import { dossierParent, joindreChemins, nomDeBase } from '../fs/paths';
import { nomLibreDeConflit } from '../page/conflict';

const motif = /\.conflit-\d{4}-\d{2}-\d{2}-\d{6}(-\d+)?(\.[^.]*)?$/;

/**
 * Nom de la sauvegarde d'un fichier qui diverge : `page.conflit-[date].md`
 * pour une page (README §5), et la même forme pour tout autre fichier
 * (`.order.conflit-[date]`, `theme.conflit-[date].toml`).
 */
export function nomDeSauvegarde(nom: string, date: Date, dejaPris: readonly string[]): string {
  // Un nom qui commence par un point (« .order ») n'a pas d'extension.
  const point = nom.lastIndexOf('.');
  const [base, extension] = point > 0 ? [nom.slice(0, point), nom.slice(point)] : [nom, ''];
  return nomLibreDeConflit(base, extension, date, dejaPris);
}

/** Vrai pour une sauvegarde de conflit, quel que soit le fichier d'origine. */
export function estSauvegardeDeConflit(chemin: string): boolean {
  return motif.test(nomDeBase(chemin));
}

/**
 * Garde la version du NAS à côté du fichier local, sous un nom libre des
 * deux côtés, avant que la version du poste ne la remplace là-bas. Rend le
 * chemin de la sauvegarde.
 */
export async function sauvegarderVersionDistante(
  local: LocalFs,
  chemin: string,
  contenu: Uint8Array,
  date: Date,
  prisSurLeNas: readonly string[] = [],
): Promise<string> {
  const dossier = dossierParent(chemin);
  const pris = [...(await local.lister(dossier)).map((entree) => entree.nom), ...prisSurLeNas];
  const sauvegarde = joindreChemins(dossier, nomDeSauvegarde(nomDeBase(chemin), date, pris));
  await local.ecrireOctets(sauvegarde, contenu);
  return sauvegarde;
}
