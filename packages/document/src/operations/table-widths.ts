import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Transform } from '@tiptap/pm/transform';

/**
 * Largeur des colonnes des tableaux (docs/spec/editeur.md) : elle vit dans
 * l'en-tête de la page (`table_widths`), une liste de pourcentages par tableau
 * dans l'ordre de la page, et dans l'attribut `largeurs` des tableaux une fois
 * la page ouverte. Une liste vide : colonnes égales.
 */

/** Les largeurs de chaque tableau du document, dans l'ordre ; [] pour un tableau aux colonnes égales. */
export function largeursDesTableaux(document: ProseMirrorNode): number[][] {
  const largeurs: number[][] = [];
  document.descendants((noeud) => {
    if (noeud.type.name !== 'table') {
      return true;
    }
    const valeur = noeud.attrs['largeurs'] as number[] | null;
    largeurs.push(valeur !== null && valeur.length === (noeud.firstChild?.childCount ?? 0) ? [...valeur] : []);
    return false;
  });
  // Les tableaux de la fin aux colonnes égales n'ont rien à écrire.
  while (largeurs.length > 0 && largeurs[largeurs.length - 1]!.length === 0) {
    largeurs.pop();
  }
  return largeurs;
}

/**
 * Le document avec les largeurs de l'en-tête posées sur ses tableaux, dans
 * l'ordre. Une liste qui n'a pas le nombre de colonnes du tableau est ignorée.
 */
export function avecLargeursDesTableaux(document: ProseMirrorNode, largeurs: readonly (readonly number[])[]): ProseMirrorNode {
  if (largeurs.length === 0) {
    return document;
  }
  let rang = 0;
  const transformation = new Transform(document);
  document.descendants((noeud, position) => {
    if (noeud.type.name !== 'table') {
      return true;
    }
    const voulues = largeurs[rang++];
    if (voulues !== undefined && voulues.length > 0 && voulues.length === (noeud.firstChild?.childCount ?? 0)) {
      // Changer un attribut ne déplace aucune position : celles du document de départ restent bonnes.
      transformation.setNodeMarkup(position, undefined, { ...noeud.attrs, largeurs: [...voulues] });
    }
    return false;
  });
  return transformation.doc;
}

/**
 * Nouvelles largeurs après avoir glissé la bordure entre la colonne `colonne`
 * et la suivante de `ecart` points de pourcentage : seules ces deux colonnes
 * changent, chacune garde au moins 5 %, le total reste 100.
 */
export function deplacerBordure(largeurs: readonly number[], colonne: number, ecart: number): number[] {
  const resultat = [...largeurs];
  const gauche = resultat[colonne];
  const droite = resultat[colonne + 1];
  if (gauche === undefined || droite === undefined) {
    return resultat;
  }
  const minimum = 5;
  const borne = Math.max(minimum - gauche, Math.min(droite - minimum, ecart));
  resultat[colonne] = gauche + borne;
  resultat[colonne + 1] = droite - borne;
  return resultat;
}

/** Des colonnes égales en pourcentages entiers dont le total fait 100 : le reste va aux premières. */
export function largeursEgales(colonnes: number): number[] {
  const base = Math.floor(100 / colonnes);
  return Array.from({ length: colonnes }, (_, index) => base + (index < 100 - base * colonnes ? 1 : 0));
}
