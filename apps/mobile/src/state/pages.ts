import type { TreeNode } from '@notes/core';

/** Une page de l'arborescence avec le titre de ses ancêtres, pour la situer. */
export interface PageListee {
  noeud: TreeNode;
  parents: string[];
}

/** Toutes les pages lisibles, dans l'ordre de l'arborescence. Les dossiers sans page.md n'ont rien à lire. */
export function pagesAplaties(arbre: readonly TreeNode[]): PageListee[] {
  const pages: PageListee[] = [];
  const parcourir = (noeuds: readonly TreeNode[], parents: string[]): void => {
    for (const noeud of noeuds) {
      if (noeud.genre !== 'dossier') {
        pages.push({ noeud, parents });
      }
      parcourir(noeud.enfants, [...parents, noeud.titre]);
    }
  };
  parcourir(arbre, []);
  return pages;
}

/** Le nœud d'un chemin, avec ses ancêtres. */
export function trouverAvecParents(arbre: readonly TreeNode[], chemin: string): { noeud: TreeNode; parents: TreeNode[] } | null {
  for (const noeud of arbre) {
    if (noeud.chemin === chemin) {
      return { noeud, parents: [] };
    }
    if (chemin.startsWith(`${noeud.chemin}/`)) {
      const trouve = trouverAvecParents(noeud.enfants, chemin);
      return trouve === null ? null : { noeud: trouve.noeud, parents: [noeud, ...trouve.parents] };
    }
  }
  return null;
}
