import type { Node as ProseMirrorNode, ResolvedPos } from '@tiptap/pm/model';

/**
 * Ce qu'est un « bloc » pour la gestion au clavier (README §6) : ce qu'on
 * sélectionne, déplace et duplique d'un seul geste. Un paragraphe, un titre, un
 * bloc de code, une citation, et chaque item de liste avec ce qu'il contient.
 * Une liste elle-même n'est pas un bloc (ses items le sont), ni le premier
 * paragraphe d'un item (c'est le texte de l'item).
 */

const listes = ['bulletList', 'orderedList', 'taskList'];
const items = ['listItem', 'taskItem'];

export const estListe = (noeud: ProseMirrorNode): boolean => listes.includes(noeud.type.name);
export const estItem = (noeud: ProseMirrorNode): boolean => items.includes(noeud.type.name);

/** Vrai si « noeud », enfant numéro « index » de « parent », est un bloc. */
export function estBloc(noeud: ProseMirrorNode, parent: ProseMirrorNode, index: number): boolean {
  if (!noeud.isBlock || estListe(noeud)) {
    return false;
  }
  if (estItem(parent)) {
    return index > 0;
  }
  return parent.type.name === 'doc' || parent.type.name === 'blockquote' || estListe(parent);
}

/**
 * Vrai si ce nœud peut faire partie d'une sélection étendue : un bloc, ou une
 * liste entière quand elle est la voisine d'un bloc (on étend la sélection
 * d'un paragraphe à la liste qui le suit, pas à son premier item).
 */
export function estUnite(noeud: ProseMirrorNode, parent: ProseMirrorNode, index: number): boolean {
  return estBloc(noeud, parent, index) || (estListe(noeud) && !estListe(parent));
}

/** Une suite de blocs frères. */
export interface BlockRange {
  /** Position juste avant le premier bloc. */
  debut: number;
  /** Position juste après le dernier. */
  fin: number;
  /** Profondeur du nœud qui les contient (0 pour le document). */
  profondeur: number;
  /** Index du premier et du dernier bloc dans ce conteneur. */
  premier: number;
  dernier: number;
}

/** Plage des enfants [premier, dernier] du nœud de profondeur « profondeur » qui contient « position ». */
export function plageDEnfants(position: ResolvedPos, profondeur: number, premier: number, dernier: number): BlockRange {
  const conteneur = position.node(profondeur);
  let debut = position.start(profondeur);
  for (let i = 0; i < premier; i++) {
    debut += conteneur.child(i).nodeSize;
  }
  let fin = debut;
  for (let i = premier; i <= dernier; i++) {
    fin += conteneur.child(i).nodeSize;
  }
  return { debut, fin, profondeur, premier, dernier };
}

/**
 * Les blocs touchés par une sélection de texte : le bloc le plus intérieur qui
 * contient ses deux bouts, ou la suite de blocs frères qu'elle traverse. Une
 * liste où la sélection commence ou finit est prise en entier.
 */
export function blocsAutour(de: ResolvedPos, a: ResolvedPos): BlockRange | null {
  for (let profondeur = Math.min(de.sharedDepth(a.pos), de.depth - 1, a.depth - 1); profondeur >= 0; profondeur--) {
    const conteneur = de.node(profondeur);
    const premier = de.index(profondeur);
    const dernier = a.index(profondeur);
    if (premier <= dernier && dernier < conteneur.childCount && estUnite(conteneur.child(premier), conteneur, premier) && estUnite(conteneur.child(dernier), conteneur, dernier)) {
      return plageDEnfants(de, profondeur, premier, dernier);
    }
  }
  return null;
}

/** Position de début de tous les blocs du document, dans l'ordre de lecture (un item avant ses sous-items). */
export function listerBlocs(document: ProseMirrorNode): number[] {
  const positions: number[] = [];
  document.descendants((noeud, position, parent, index) => {
    if (parent !== null && estBloc(noeud, parent, index)) {
      positions.push(position);
    }
    // Inutile de descendre dans un bloc de texte.
    return !noeud.isTextblock;
  });
  return positions;
}
