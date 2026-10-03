import type { LocalFs } from '../fs/local-fs';
import { dossierParent, estDansDossier } from '../fs/paths';
import type { RemoteFs } from '../fs/remote-fs';
import type { SyncIndex } from './index-store';
import type { Releve } from './scan';

/**
 * Le NAS ne distingue pas les majuscules des minuscules, le poste Linux si.
 * Une page renommée de « courses » en « Courses » ne doit donc pas devenir
 * « supprimer courses, envoyer Courses » : sur le NAS ce sont le même
 * fichier, et la suppression emporterait ce qu'on vient d'envoyer. Ce module
 * repère ces changements de casse avant le calcul du delta et les applique
 * par un renommage.
 */

const pli = (chemin: string): string => chemin.toLowerCase();

/**
 * Chemins dont la casse seule les distingue d'un autre chemin du même côté
 * (« Note » et « note » dans le même dossier). Ils ne peuvent pas coexister
 * sur le NAS : la sync les laisse de côté, eux et leur contenu.
 */
export function collisionsDeCasse(releve: Releve): string[] {
  const parPli = new Map<string, string[]>();
  for (const chemin of releve.keys()) {
    const groupe = parPli.get(pli(chemin)) ?? [];
    groupe.push(chemin);
    parPli.set(pli(chemin), groupe);
  }
  const collisions = [...parPli.values()].filter((groupe) => groupe.length > 1).flat();
  // Seuls les plus hauts comptent : le contenu d'un dossier écarté l'est avec lui.
  return collisions.filter((chemin) => !collisions.some((autre) => autre !== chemin && estDansDossier(chemin, autre))).sort();
}

export interface CaseRename {
  /** Le côté renommé : « local » si le NAS avait la nouvelle casse, « distant » sinon. */
  cote: 'local' | 'distant';
  de: string;
  vers: string;
}

/**
 * Aligne la casse des deux côtés, du haut vers le bas de l'arborescence.
 * Le côté qui a changé de nom depuis le dernier passage (d'après l'index)
 * impose le sien ; sans index, c'est le poste. Les relevés et l'index sont
 * réécrits sous les nouveaux noms. `exclus` : chemins laissés de côté.
 */
export async function alignerLaCasse(
  local: LocalFs,
  distant: RemoteFs,
  releveLocal: Releve,
  releveDistant: Releve,
  index: SyncIndex,
  exclus: readonly string[],
): Promise<CaseRename[]> {
  const faits: CaseRename[] = [];
  const estExclu = (chemin: string): boolean => exclus.some((exclu) => estDansDossier(chemin, exclu));
  for (;;) {
    const localParPli = new Map<string, string>();
    for (const chemin of releveLocal.keys()) {
      localParPli.set(pli(chemin), chemin);
    }
    const ecarts: { l: string; d: string }[] = [];
    for (const d of releveDistant.keys()) {
      const l = localParPli.get(pli(d));
      if (l !== undefined && l !== d && !releveLocal.has(d) && !releveDistant.has(l) && !estExclu(l) && !estExclu(d) && dossierParent(l) === dossierParent(d)) {
        ecarts.push({ l, d });
      }
    }
    if (ecarts.length === 0) {
      return faits;
    }
    // Un seul renommage, le plus haut : ceux du dessous changent de chemin avec lui.
    const { l, d } = ecarts.sort((a, b) => a.l.split('/').length - b.l.split('/').length)[0]!;
    const connu = (chemin: string): boolean => Object.keys(index.fichiers).some((cle) => estDansDossier(cle, chemin)) || index.dossiers.includes(chemin);
    if (connu(l) && !connu(d)) {
      await local.renommer(l, d);
      renommerCles(releveLocal, l, d);
      faits.push({ cote: 'local', de: l, vers: d });
      renommerIndex(index, l, d);
    } else {
      await distant.renommer(d, l);
      renommerCles(releveDistant, d, l);
      faits.push({ cote: 'distant', de: d, vers: l });
      renommerIndex(index, d, l);
    }
  }
}

function deplacer(chemin: string, de: string, vers: string): string {
  return estDansDossier(chemin, de) ? vers + chemin.slice(de.length) : chemin;
}

function renommerCles(releve: Releve, de: string, vers: string): void {
  for (const [chemin, entree] of [...releve]) {
    if (estDansDossier(chemin, de)) {
      releve.delete(chemin);
      releve.set(deplacer(chemin, de, vers), entree);
    }
  }
}

function renommerIndex(index: SyncIndex, de: string, vers: string): void {
  index.fichiers = Object.fromEntries(Object.entries(index.fichiers).map(([chemin, entree]) => [deplacer(chemin, de, vers), entree]));
  index.dossiers = index.dossiers.map((chemin) => deplacer(chemin, de, vers));
}
