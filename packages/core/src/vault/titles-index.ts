import type { TreeNode } from './tree';

export interface TitleEntry {
  id: string;
  titre: string;
  chemin: string;
}

/** Index des pages importées par identifiant : base des liens entre pages et de la recherche par titre. */
export function indexerTitres(arbre: readonly TreeNode[]): Map<string, TitleEntry> {
  const index = new Map<string, TitleEntry>();
  const parcourir = (noeuds: readonly TreeNode[]): void => {
    for (const noeud of noeuds) {
      if (noeud.id !== null) {
        index.set(noeud.id, { id: noeud.id, titre: noeud.titre, chemin: noeud.chemin });
      }
      parcourir(noeud.enfants);
    }
  };
  parcourir(arbre);
  return index;
}
