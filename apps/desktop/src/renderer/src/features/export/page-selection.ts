import type { TreeNode } from '@notes/core';

/** Chemins d'une page et de toutes ses descendantes. */
export function cheminsDuSousArbre(noeud: TreeNode): string[] {
  return [noeud.chemin, ...noeud.enfants.flatMap(cheminsDuSousArbre)];
}

/**
 * Coche ou décoche une page dans la liste d'un export de plusieurs pages : ses
 * sous-pages suivent. On peut ensuite recocher une sous-page seule ; sa page
 * parente, décochée, reste hors de l'archive (son titre reste dans la navigation).
 */
export function basculerPage(exclues: ReadonlySet<string>, noeud: TreeNode, gardee: boolean): Set<string> {
  const suivantes = new Set(exclues);
  for (const chemin of cheminsDuSousArbre(noeud)) {
    if (gardee) {
      suivantes.delete(chemin);
    } else {
      suivantes.add(chemin);
    }
  }
  return suivantes;
}

/** Nombre de pages gardées dans l'archive. */
export function pagesGardees(racine: TreeNode, exclues: ReadonlySet<string>): number {
  return cheminsDuSousArbre(racine).filter((chemin) => !exclues.has(chemin)).length;
}
