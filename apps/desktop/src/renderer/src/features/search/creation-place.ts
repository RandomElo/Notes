import { dossierParent, trouverNoeud } from '@notes/core';
import type { TreeNode } from '@notes/core';

/** Où créer une page depuis la recherche : juste après la page ouverte, dedans (sous-page), ou à la racine. */
export type CreationPlace = 'apres' | 'dans' | 'racine';

/** Les emplacements proposés, le premier par défaut. Sans page ouverte, seulement la racine. */
export function emplacementsProposes(pageOuverte: TreeNode | null): CreationPlace[] {
  return pageOuverte?.importe === true ? ['apres', 'dans', 'racine'] : ['racine'];
}

/** Ce que demander au main : dossier parent et rang parmi les pages de ce dossier (absent : à la fin). */
export function demandeDeCreation(arbre: readonly TreeNode[], pageOuverte: TreeNode | null, ou: CreationPlace): { parent: string; index?: number } {
  if (pageOuverte === null || ou === 'racine') {
    return { parent: '' };
  }
  if (ou === 'dans') {
    return { parent: pageOuverte.chemin };
  }
  const parent = dossierParent(pageOuverte.chemin);
  // Le rang se compte parmi les pages importées du dossier, comme dans le core (même règle que Ctrl+N).
  const soeurs = (parent === '' ? arbre : (trouverNoeud(arbre, parent)?.enfants ?? [])).filter((noeud) => noeud.importe);
  return { parent, index: soeurs.findIndex((noeud) => noeud.chemin === pageOuverte.chemin) + 1 };
}

/** Libellé d'une ligne de création dans la recherche. */
export function libelleDeCreation(titre: string, ou: CreationPlace, pageOuverte: TreeNode | null): string {
  switch (ou) {
    case 'apres':
      return `Créer « ${titre} » après « ${pageOuverte?.titre ?? ''} »`;
    case 'dans':
      return `Créer « ${titre} » dans « ${pageOuverte?.titre ?? ''} »`;
    case 'racine':
      return `Créer « ${titre} » à la racine`;
  }
}
