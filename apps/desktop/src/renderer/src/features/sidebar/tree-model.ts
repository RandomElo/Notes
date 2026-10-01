import { dossierParent, estDansDossier, trouverNoeud } from '@notes/core';
import type { TreeNode } from '@notes/core';

/** Une ligne affichée dans l'arborescence. */
export interface VisibleRow {
  noeud: TreeNode;
  profondeur: number;
}

export type DropZone = 'avant' | 'apres' | 'dedans';

/** Où une page doit atterrir : son nouveau parent et sa position parmi les pages de ce parent. */
export interface MoveTarget {
  parent: string;
  index: number;
}

/** Clé stable d'un élément : son identifiant s'il est importé, sinon son chemin. Elle survit aux renommages. */
export function cleDeNoeud(noeud: TreeNode): string {
  return noeud.id ?? `chemin:${noeud.chemin}`;
}

/** Lignes à afficher, dans l'ordre, compte tenu des éléments dépliés. */
export function lignesVisibles(arbre: readonly TreeNode[], deplies: ReadonlySet<string>, profondeur = 0): VisibleRow[] {
  return arbre.flatMap((noeud) => [
    { noeud, profondeur },
    ...(deplies.has(cleDeNoeud(noeud)) ? lignesVisibles(noeud.enfants, deplies, profondeur + 1) : []),
  ]);
}

/** Zone visée selon la hauteur du pointeur dans la ligne (0 en haut, 1 en bas). */
export function zoneDeDepot(hauteurRelative: number, peutContenir: boolean): DropZone {
  if (!peutContenir) {
    return hauteurRelative < 0.5 ? 'avant' : 'apres';
  }
  if (hauteurRelative < 0.25) {
    return 'avant';
  }
  return hauteurRelative > 0.75 ? 'apres' : 'dedans';
}

function enfantsDe(arbre: readonly TreeNode[], parent: string): readonly TreeNode[] | null {
  return parent === '' ? arbre : (trouverNoeud(arbre, parent)?.enfants ?? null);
}

/** Un parent acceptable est la racine ou une page importée. */
function peutAccueillir(arbre: readonly TreeNode[], parent: string): boolean {
  return parent === '' || trouverNoeud(arbre, parent)?.importe === true;
}

/**
 * Traduit un dépôt en déplacement. null si le dépôt n'a pas de sens : page
 * déposée sur elle-même ou dans sa descendance, parent non importé.
 */
export function cibleDeDepot(
  arbre: readonly TreeNode[],
  deplace: string,
  survole: string,
  zone: DropZone,
): MoveTarget | null {
  if (trouverNoeud(arbre, deplace)?.importe !== true || estDansDossier(survole, deplace)) {
    return null;
  }
  const cible = trouverNoeud(arbre, survole);
  if (cible === null) {
    return null;
  }
  const parent = zone === 'dedans' ? survole : dossierParent(survole);
  if (!peutAccueillir(arbre, parent)) {
    return null;
  }
  // La position se compte parmi les pages importées du parent, la page déplacée mise à part.
  const pages = (enfantsDe(arbre, parent) ?? []).filter((enfant) => enfant.importe && enfant.chemin !== deplace);
  if (zone === 'dedans') {
    return { parent, index: pages.length };
  }
  const rang = pages.findIndex((page) => page.chemin === survole);
  if (rang === -1) {
    // Dépôt à côté d'un élément non importé : ils sont toujours après les pages.
    return { parent, index: pages.length };
  }
  return { parent, index: zone === 'avant' ? rang : rang + 1 };
}

/** Déplacement d'un cran parmi les pages sœurs, pour le clavier. null si la page est déjà au bord. */
export function cibleDeDecalage(arbre: readonly TreeNode[], chemin: string, sens: -1 | 1): MoveTarget | null {
  const parent = dossierParent(chemin);
  const pages = (enfantsDe(arbre, parent) ?? []).filter((enfant) => enfant.importe);
  const rang = pages.findIndex((page) => page.chemin === chemin);
  const nouveauRang = rang + sens;
  if (rang === -1 || nouveauRang < 0 || nouveauRang >= pages.length) {
    return null;
  }
  return { parent, index: nouveauRang };
}

/** Clés des ancêtres d'un élément, pour le déplier jusqu'à lui. */
export function clesDesAncetres(arbre: readonly TreeNode[], chemin: string): string[] {
  const cles: string[] = [];
  for (let parent = dossierParent(chemin); parent !== ''; parent = dossierParent(parent)) {
    const noeud = trouverNoeud(arbre, parent);
    if (noeud !== null) {
      cles.push(cleDeNoeud(noeud));
    }
  }
  return cles;
}

/** Retrouve un élément par sa clé stable. */
export function trouverParCle(arbre: readonly TreeNode[], cle: string | null): TreeNode | null {
  if (cle === null) {
    return null;
  }
  for (const noeud of arbre) {
    if (cleDeNoeud(noeud) === cle) {
      return noeud;
    }
    const trouve = trouverParCle(noeud.enfants, cle);
    if (trouve !== null) {
      return trouve;
    }
  }
  return null;
}
