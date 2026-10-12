import { Fragment } from '@tiptap/pm/model';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { liftListItem, sinkListItem } from '@tiptap/pm/schema-list';
import { NodeSelection, Selection, TextSelection } from '@tiptap/pm/state';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import { blocsAutour, estBloc, estItem, estListe, estUnite, listerBlocs, plageDEnfants } from './block-ranges';
import type { BlockRange } from './block-ranges';
import { BlockSelection } from './block-selection';

/**
 * Commandes sur les blocs (docs/spec/editeur.md). Chacune rend la transaction à
 * appliquer, ou null si elle n'a rien à faire. Elles s'appliquent aux blocs
 * sélectionnés ou, sans sélection de blocs, au bloc où se trouve le curseur.
 */
export type BlockCommand = (etat: EditorState) => Transaction | null;

/** Les blocs concernés par une commande : la sélection de blocs, ou le bloc du curseur. */
export function plageCourante(etat: EditorState): BlockRange | null {
  const { selection } = etat;
  if (selection instanceof BlockSelection) {
    return selection.plage();
  }
  if (selection instanceof NodeSelection) {
    const position = selection.$from;
    return estBloc(selection.node, position.parent, position.index())
      ? plageDEnfants(position, position.depth, position.index(), position.index())
      : null;
  }
  if (selection.$from.depth === 0 || selection.$to.depth === 0) {
    // Tout sélectionner (Ctrl+A) : la sélection part du document lui-même, pas de l'intérieur d'un bloc.
    const premier = selection.$from.index(0);
    const dernier = selection.$to.depth === 0 ? selection.$to.index(0) - 1 : selection.$to.index(0);
    return dernier >= premier ? plageDEnfants(etat.doc.resolve(0), 0, premier, dernier) : null;
  }
  return blocsAutour(selection.$from, selection.$to);
}

/** Entrée : quitte la sélection de blocs et place le curseur à la fin du dernier bloc. */
export const editerBloc: BlockCommand = (etat) => {
  if (!(etat.selection instanceof BlockSelection)) {
    return null;
  }
  return etat.tr.setSelection(Selection.near(etat.doc.resolve(etat.selection.to), -1)).scrollIntoView();
};

/**
 * Échap : sélectionne le bloc du curseur. Sur des items déjà sélectionnés,
 * prend toute leur liste, sous-listes comprises. Sinon, ou sur une liste
 * entière, Échap rend le curseur.
 */
export const selectionnerBloc: BlockCommand = (etat) => {
  const plage = plageCourante(etat);
  if (plage === null) {
    return null;
  }
  if (!(etat.selection instanceof BlockSelection)) {
    return etat.tr.setSelection(BlockSelection.depuisPlage(etat.doc, plage)).scrollIntoView();
  }
  const cible = listeEntiere(etat.doc, plage);
  return cible === null ? editerBloc(etat) : etat.tr.setSelection(BlockSelection.depuisPlage(etat.doc, cible)).scrollIntoView();
};

/** La liste de premier niveau qui contient des items sélectionnés, prise en entier, ou null si la plage n'est pas faite d'items. */
function listeEntiere(document: ProseMirrorNode, plage: BlockRange): BlockRange | null {
  const position = document.resolve(plage.debut);
  if (!estListe(position.parent)) {
    return null;
  }
  // La liste la plus extérieure : celle d'un sous-item est la liste de son item parent.
  let profondeur = plage.profondeur;
  while (profondeur >= 3 && estItem(position.node(profondeur - 1)) && estListe(position.node(profondeur - 2))) {
    profondeur -= 2;
  }
  const index = position.index(profondeur - 1);
  return plageDEnfants(position, profondeur - 1, index, index);
}

/** Flèches : passe au bloc précédent ou suivant dans l'ordre de lecture. */
export const allerAuBloc =
  (sens: -1 | 1): BlockCommand =>
  (etat) => {
    if (!(etat.selection instanceof BlockSelection)) {
      return null;
    }
    const blocs = listerBlocs(etat.doc);
    const { debut, fin } = etat.selection.plage();
    const dernier = fin - (etat.doc.resolve(fin).nodeBefore?.nodeSize ?? 0);
    const cible = blocs[blocs.indexOf(sens > 0 ? dernier : debut) + sens];
    return cible === undefined ? null : etat.tr.setSelection(new BlockSelection(etat.doc, cible)).scrollIntoView();
  };

/** Maj+flèches : étend ou réduit la sélection d'un bloc frère. */
export const etendreSelection =
  (sens: -1 | 1): BlockCommand =>
  (etat) => {
    const { selection } = etat;
    if (!(selection instanceof BlockSelection)) {
      return null;
    }
    const tete = etat.doc.resolve(selection.tete);
    const index = tete.index() + sens;
    if (index < 0 || index >= tete.parent.childCount || !estUnite(tete.parent.child(index), tete.parent, index)) {
      return null;
    }
    const voisin = plageDEnfants(tete, tete.depth, index, index);
    return etat.tr.setSelection(new BlockSelection(etat.doc, selection.ancre, voisin.debut)).scrollIntoView();
  };

/** Suppr ou Retour arrière : supprime les blocs sélectionnés, puis sélectionne le bloc qui prend leur place. */
export const supprimerBlocs: BlockCommand = (etat) => {
  if (!(etat.selection instanceof BlockSelection)) {
    return null;
  }
  const { debut, fin } = etat.selection.plage();
  const transaction = etat.tr.deleteRange(debut, fin);
  const position = transaction.mapping.map(debut);
  const blocs = listerBlocs(transaction.doc);
  const suivant = blocs.find((bloc) => bloc >= position) ?? blocs[blocs.length - 1];
  const texteRestant = transaction.doc.textContent !== '' || transaction.doc.childCount > 1;
  transaction.setSelection(
    suivant !== undefined && texteRestant ? new BlockSelection(transaction.doc, suivant) : Selection.atStart(transaction.doc),
  );
  return transaction.scrollIntoView();
};

/** Ctrl+D : duplique les blocs juste en dessous. La sélection ou le curseur passe dans la copie. */
export const dupliquerBlocs: BlockCommand = (etat) => {
  const plage = plageCourante(etat);
  if (plage === null) {
    return null;
  }
  const taille = plage.fin - plage.debut;
  const transaction = etat.tr.insert(plage.fin, etat.doc.slice(plage.debut, plage.fin).content);
  return decalerSelection(etat, transaction, taille).scrollIntoView();
};

/** Ctrl+Maj+flèches : déplace les blocs d'un cran vers le haut ou vers le bas. Les sous-items d'un item le suivent. */
export const deplacerBlocs =
  (sens: -1 | 1): BlockCommand =>
  (etat) => {
    const plage = plageCourante(etat);
    if (plage === null) {
      return null;
    }
    const position = etat.doc.resolve(plage.debut);
    const conteneur = position.parent;
    const enfants = enfantsDe(conteneur);
    const deplaces = enfants.slice(plage.premier, plage.dernier + 1);
    const voisin = sens < 0 ? plage.premier - 1 : plage.dernier + 1;

    if (voisin >= 0 && voisin < enfants.length) {
      // Un frère de ce côté : les blocs passent de l'autre côté de lui.
      const frere = enfants[voisin] as ProseMirrorNode;
      const avant = enfants.slice(0, Math.min(voisin, plage.premier));
      const apres = enfants.slice(Math.max(voisin, plage.dernier) + 1);
      const milieu = sens < 0 ? [...deplaces, frere] : [frere, ...deplaces];
      const decalage = sens < 0 ? -frere.nodeSize : frere.nodeSize;
      return remplacerEnfants(etat, position.depth, [...avant, ...milieu, ...apres], decalage, plage.debut);
    }

    // Premier ou dernier item de sa liste : il en sort, pour passer de l'autre côté du bloc voisin de la liste.
    if (!estListe(conteneur) || plage.profondeur < 1) {
      return null;
    }
    const exterieur = position.node(plage.profondeur - 1);
    if (estItem(exterieur)) {
      return changerDeParent(etat, plage, sens);
    }
    const freres = enfantsDe(exterieur);
    const indexListe = position.index(plage.profondeur - 1);
    const indexVoisin = indexListe + sens;
    const cible = freres[indexVoisin];
    if (cible === undefined) {
      return null;
    }
    const restants = enfants.filter((_enfant, index) => index < plage.premier || index > plage.dernier);
    const reste = restants.length > 0 ? [conteneur.copy(Fragment.fromArray(restants))] : [];
    const memeListe = cible.type === conteneur.type;
    const debutExterieur = position.start(plage.profondeur - 1);

    let nouveaux: ProseMirrorNode[];
    let nouveauDebut: number;
    if (sens < 0) {
      const avant = freres.slice(0, indexVoisin);
      const apres = freres.slice(indexListe + 1);
      if (memeListe) {
        // La liste du dessus est de la même nature : les items la rejoignent, à la fin.
        nouveaux = [...avant, cible.copy(cible.content.append(Fragment.fromArray(deplaces))), ...reste, ...apres];
        nouveauDebut = debutExterieur + taille(avant) + 1 + cible.content.size;
      } else if (avant.at(-1)?.type === conteneur.type) {
        // Au-delà du bloc franchi, une liste de même nature : les items la rejoignent plutôt que d'en former une autre.
        const rejointe = avant.pop() as ProseMirrorNode;
        nouveaux = [...avant, rejointe.copy(rejointe.content.append(Fragment.fromArray(deplaces))), cible, ...reste, ...apres];
        nouveauDebut = debutExterieur + taille(avant) + 1 + rejointe.content.size;
      } else {
        nouveaux = [...avant, conteneur.copy(Fragment.fromArray(deplaces)), cible, ...reste, ...apres];
        nouveauDebut = debutExterieur + taille(avant) + 1;
      }
    } else {
      const avant = freres.slice(0, indexListe);
      const apres = freres.slice(indexVoisin + 1);
      if (memeListe) {
        nouveaux = [...avant, ...reste, cible.copy(Fragment.fromArray(deplaces).append(cible.content)), ...apres];
        nouveauDebut = debutExterieur + taille(avant) + taille(reste) + 1;
      } else if (apres[0]?.type === conteneur.type) {
        const rejointe = apres.shift() as ProseMirrorNode;
        nouveaux = [...avant, ...reste, cible, rejointe.copy(Fragment.fromArray(deplaces).append(rejointe.content)), ...apres];
        nouveauDebut = debutExterieur + taille(avant) + taille(reste) + cible.nodeSize + 1;
      } else {
        nouveaux = [...avant, ...reste, cible, conteneur.copy(Fragment.fromArray(deplaces)), ...apres];
        nouveauDebut = debutExterieur + taille(avant) + taille(reste) + cible.nodeSize + 1;
      }
    }
    return remplacerEnfants(etat, plage.profondeur - 1, nouveaux, nouveauDebut - plage.debut, plage.debut);
  };

const taille = (noeuds: readonly ProseMirrorNode[]): number => noeuds.reduce((somme, noeud) => somme + noeud.nodeSize, 0);

/**
 * Sous-items au bord de leur sous-liste : ils gardent leur niveau et passent
 * sous l'item voisin de leur parent (à la fin de ses sous-items en montant, au
 * début en descendant). Sans voisin, ils sortent au niveau de leur parent.
 */
function changerDeParent(etat: EditorState, plage: BlockRange, sens: -1 | 1): Transaction | null {
  const position = etat.doc.resolve(plage.debut);
  const sousListe = position.parent;
  const niveauParent = plage.profondeur - 2;
  if (niveauParent < 0 || !estListe(position.node(niveauParent))) {
    return null;
  }
  const items = enfantsDe(position.node(niveauParent));
  const rangParent = position.index(niveauParent);
  const parent = items[rangParent] as ProseMirrorNode;
  const enfants = enfantsDe(sousListe);
  const deplaces = enfants.slice(plage.premier, plage.dernier + 1);
  const restants = enfants.filter((_enfant, index) => index < plage.premier || index > plage.dernier);

  // Le parent sans les items qui partent, et sans sa sous-liste si elle se vide.
  const contenuParent = enfantsDe(parent);
  contenuParent.splice(position.index(plage.profondeur - 1), 1, ...(restants.length > 0 ? [sousListe.copy(Fragment.fromArray(restants))] : []));
  const parentAllege = parent.copy(Fragment.fromArray(contenuParent));

  const debutListe = position.start(niveauParent);
  const avant = items.slice(0, rangParent);
  const apres = items.slice(rangParent + 1);
  let nouveaux: ProseMirrorNode[];
  let nouveauDebut: number;
  if (sens < 0) {
    const voisin = avant.pop();
    if (voisin === undefined) {
      nouveaux = [...deplaces, parentAllege, ...apres];
      nouveauDebut = debutListe;
    } else {
      const contenu = enfantsDe(voisin);
      const derniere = contenu.at(-1);
      let dedans: number;
      if (derniere !== undefined && derniere.type === sousListe.type) {
        dedans = 1 + taille(contenu.slice(0, -1)) + 1 + derniere.content.size;
        contenu[contenu.length - 1] = derniere.copy(derniere.content.append(Fragment.fromArray(deplaces)));
      } else {
        dedans = 1 + taille(contenu) + 1;
        contenu.push(sousListe.copy(Fragment.fromArray(deplaces)));
      }
      nouveaux = [...avant, voisin.copy(Fragment.fromArray(contenu)), parentAllege, ...apres];
      nouveauDebut = debutListe + taille(avant) + dedans;
    }
  } else {
    const voisin = apres.shift();
    if (voisin === undefined) {
      nouveaux = [...avant, parentAllege, ...deplaces];
      nouveauDebut = debutListe + taille(avant) + parentAllege.nodeSize;
    } else {
      const contenu = enfantsDe(voisin);
      const texte = contenu[0];
      const premiere = contenu[1];
      if (texte === undefined) {
        return null;
      }
      if (premiere !== undefined && premiere.type === sousListe.type) {
        contenu[1] = premiere.copy(Fragment.fromArray(deplaces).append(premiere.content));
      } else {
        contenu.splice(1, 0, sousListe.copy(Fragment.fromArray(deplaces)));
      }
      nouveaux = [...avant, parentAllege, voisin.copy(Fragment.fromArray(contenu)), ...apres];
      nouveauDebut = debutListe + taille(avant) + parentAllege.nodeSize + 1 + texte.nodeSize + 1;
    }
  }
  return remplacerEnfants(etat, niveauParent, nouveaux, nouveauDebut - plage.debut, plage.debut);
}

/** Tab et Maj+Tab sur des items sélectionnés : les imbrique dans l'item du dessus, ou les remonte d'un niveau. */
export const indenterBlocs =
  (sens: -1 | 1): BlockCommand =>
  (etat) => {
    const { selection } = etat;
    if (!(selection instanceof BlockSelection)) {
      return null;
    }
    const plage = selection.plage();
    const position = etat.doc.resolve(plage.debut);
    const premier = position.nodeAfter;
    if (!estListe(position.parent) || premier === null) {
      return null;
    }
    // Les commandes de liste de ProseMirror partent d'une sélection de texte : du premier au dernier item.
    const dernier = plage.fin - (etat.doc.resolve(plage.fin).nodeBefore?.nodeSize ?? 0);
    const dansLeTexte = etat.apply(etat.tr.setSelection(TextSelection.create(etat.doc, plage.debut + 2, dernier + 2)));
    let transaction: Transaction | null = null;
    (sens > 0 ? sinkListItem : liftListItem)(premier.type)(dansLeTexte, (produite) => {
      transaction = produite;
    });
    if (transaction === null) {
      return null;
    }
    const produite = transaction as Transaction;
    const blocA = blocsAutour(produite.doc.resolve(produite.mapping.map(plage.debut + 2)), produite.doc.resolve(produite.mapping.map(plage.debut + 2)));
    const blocB = blocsAutour(produite.doc.resolve(produite.mapping.map(dernier + 2)), produite.doc.resolve(produite.mapping.map(dernier + 2)));
    if (blocA !== null && blocB !== null) {
      const valide = BlockSelection.valide(produite.doc, blocA.debut, blocB.debut);
      produite.setSelection(new BlockSelection(produite.doc, blocA.debut, valide ? blocB.debut : blocA.debut));
    }
    return produite.scrollIntoView();
  };

function enfantsDe(noeud: ProseMirrorNode): ProseMirrorNode[] {
  const enfants: ProseMirrorNode[] = [];
  noeud.forEach((enfant) => enfants.push(enfant));
  return enfants;
}

/**
 * Remplace les enfants du nœud de profondeur donnée qui contient « repere »,
 * puis décale la sélection d'autant que les blocs ont bougé. null si le
 * contenu obtenu n'est pas permis par le schéma.
 */
function remplacerEnfants(etat: EditorState, profondeur: number, enfants: ProseMirrorNode[], decalage: number, repere: number): Transaction | null {
  const position = etat.doc.resolve(repere);
  const conteneur = position.node(profondeur);
  const contenu = Fragment.fromArray(enfants);
  if (!conteneur.type.validContent(contenu)) {
    return null;
  }
  const debut = position.start(profondeur);
  const transaction = etat.tr.replaceWith(debut, debut + conteneur.content.size, contenu);
  return decalerSelection(etat, transaction, decalage).scrollIntoView();
}

/** Repose la sélection d'origine, décalée : elle suit les blocs déplacés ou passe dans leur copie. */
function decalerSelection(etat: EditorState, transaction: Transaction, decalage: number): Transaction {
  const { selection } = etat;
  const document = transaction.doc;
  if (selection instanceof BlockSelection) {
    return transaction.setSelection(new BlockSelection(document, selection.ancre + decalage, selection.tete + decalage));
  }
  if (selection instanceof NodeSelection) {
    return transaction.setSelection(NodeSelection.create(document, selection.from + decalage));
  }
  return transaction.setSelection(TextSelection.create(document, selection.anchor + decalage, selection.head + decalage));
}
