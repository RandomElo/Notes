import { Fragment } from '@tiptap/pm/model';
import type { Node as ProseMirrorNode, Schema } from '@tiptap/pm/model';
import type { Transform } from '@tiptap/pm/transform';

/*
 * Règles du mode liste de tâches (README §14). Tout passe par une
 * transformation ProseMirror, sans éditeur : le desktop les applique dans son
 * éditeur, le téléphone (J16) directement sur le document lu du fichier.
 */

const typesDeListe = new Set(['bulletList', 'orderedList', 'taskList']);

/** Un item de liste (puce, numéro ou tâche) devenu tâche, sous-listes comprises. Une tâche garde sa case. */
function enTache(item: ProseMirrorNode, schema: Schema): ProseMirrorNode {
  const enfants: ProseMirrorNode[] = [];
  item.forEach((enfant) => {
    enfants.push(typesDeListe.has(enfant.type.name) ? enListeDeTaches(enfant, schema) : enfant);
  });
  const coche = item.type.name === 'taskItem' && item.attrs['checked'] === true;
  return schema.nodes['taskItem']!.create({ checked: coche }, enfants);
}

function enListeDeTaches(liste: ProseMirrorNode, schema: Schema): ProseMirrorNode {
  const items: ProseMirrorNode[] = [];
  liste.forEach((item) => items.push(enTache(item, schema)));
  return schema.nodes['taskList']!.create({ tight: liste.attrs['tight'] !== false }, items);
}

/** Les titres d'une tâche (et de ses sous-tâches) deviennent des paragraphes : une page en liste n'a pas de titres. */
function sansTitres(noeud: ProseMirrorNode, schema: Schema): ProseMirrorNode {
  if (noeud.type.name === 'heading') {
    return schema.nodes['paragraph']!.create(null, noeud.content);
  }
  if (noeud.isTextblock || noeud.isLeaf || noeud.type.name === 'callout' || noeud.type.name === 'table') {
    return noeud;
  }
  const enfants: ProseMirrorNode[] = [];
  noeud.forEach((enfant) => enfants.push(sansTitres(enfant, schema)));
  const copie = noeud.copy(Fragment.from(enfants));
  return copie.eq(noeud) ? noeud : copie;
}

/**
 * Remet la page en une seule liste de tâches (README §14, choix d'Eloi du
 * 2026-10-08 : une liste par page, pas de titres). Paragraphes, titres et
 * items de puces ou numérotés deviennent des tâches ; un autre bloc (code,
 * tableau, image, callout) passe sous la tâche qui le précède, ou sous une
 * tâche vide s'il n'y en a pas. L'ordre de lecture ne change pas.
 *
 * « conversion » : passage en mode liste, les paragraphes vides
 * disparaissent. Sinon (après une modification), un paragraphe vide devient
 * une tâche vide, sauf s'il est seul dans la page. Les tâches cochées sont
 * ensuite rangées. Faux si rien n'a changé.
 */
export function normaliserListe(tr: Transform, conversion = false): boolean {
  const schema = tr.doc.type.schema;
  const items: ProseMirrorNode[] = [];
  let serree: boolean | null = null;
  const tache = (contenu: ProseMirrorNode[]): ProseMirrorNode => schema.nodes['taskItem']!.create({ checked: false }, contenu);
  const seulBlocVide = tr.doc.childCount === 1 && tr.doc.child(0).type.name === 'paragraph' && tr.doc.child(0).content.size === 0;
  if (seulBlocVide) {
    return false;
  }
  tr.doc.forEach((bloc) => {
    const nom = bloc.type.name;
    if (nom === 'taskList' || nom === 'bulletList' || nom === 'orderedList') {
      serree ??= bloc.attrs['tight'] !== false;
      const liste = nom === 'taskList' && !conversion ? bloc : enListeDeTaches(bloc, schema);
      liste.forEach((item) => items.push(sansTitres(item, schema)));
    } else if (nom === 'paragraph') {
      if (bloc.content.size > 0 || !conversion) {
        items.push(tache([bloc]));
      }
    } else if (nom === 'heading') {
      items.push(tache([schema.nodes['paragraph']!.create(null, bloc.content)]));
    } else {
      const precedent = items.pop();
      items.push(precedent === undefined ? tache([schema.nodes['paragraph']!.create(), bloc]) : precedent.copy(precedent.content.addToEnd(bloc)));
    }
  });
  let change = false;
  if (items.length > 0) {
    const liste = schema.nodes['taskList']!.create({ tight: serree ?? true }, items);
    if (!(tr.doc.childCount === 1 && tr.doc.child(0).eq(liste))) {
      tr.replaceWith(0, tr.doc.content.size, liste);
      change = true;
    }
  }
  return rangerTaches(tr) || change;
}

/** Passage d'une page en mode liste : voir `normaliserListe`. Faux si rien n'a changé. */
export function convertirEnListe(tr: Transform): boolean {
  return normaliserListe(tr, true);
}

/** La liste de la page, si la page n'est qu'une liste de tâches. */
function listeSeule(document: ProseMirrorNode): ProseMirrorNode | null {
  return document.childCount === 1 && document.child(0).type.name === 'taskList' ? document.child(0) : null;
}

/**
 * Retire les tâches laissées vides (rien d'écrit, pas cochées, rien dessous),
 * sauf celle où se trouve le curseur, comme Keep quand on quitte une ligne
 * vide. Une liste vidée laisse un paragraphe vide. Faux si rien n'a changé.
 */
export function retirerTachesVides(tr: Transform, curseur: number | null): boolean {
  const liste = listeSeule(tr.doc);
  if (liste === null) {
    return false;
  }
  const plages: { de: number; a: number }[] = [];
  let position = 1;
  liste.forEach((item) => {
    const fin = position + item.nodeSize;
    const vide = item.childCount === 1 && item.firstChild!.content.size === 0 && item.attrs['checked'] !== true;
    if (vide && !(curseur !== null && curseur > position && curseur < fin)) {
      plages.push({ de: position, a: fin });
    }
    position = fin;
  });
  if (plages.length === 0) {
    return false;
  }
  if (plages.length === liste.childCount) {
    tr.replaceWith(0, tr.doc.content.size, tr.doc.type.schema.nodes['paragraph']!.create());
    return true;
  }
  for (const plage of plages.reverse()) {
    tr.delete(plage.de, plage.a);
  }
  return true;
}

/**
 * Ouvre une tâche vide à la fin des tâches à faire, juste avant « Terminé »
 * (clic sous la liste, page qu'on vient de passer en liste). Rend la position
 * où mettre le curseur. Si une tâche vide y est déjà, c'est elle.
 */
export function ouvrirNouvelleTache(tr: Transform): number {
  const schema = tr.doc.type.schema;
  const liste = listeSeule(tr.doc);
  const tache = schema.nodes['taskItem']!.create({ checked: false }, schema.nodes['paragraph']!.create());
  if (liste === null) {
    const seulBlocVide = tr.doc.childCount === 1 && tr.doc.child(0).type.name === 'paragraph' && tr.doc.child(0).content.size === 0;
    if (seulBlocVide) {
      return 1;
    }
    tr.insert(tr.doc.content.size, schema.nodes['taskList']!.create({ tight: true }, tache));
    return tr.doc.content.size - 3;
  }
  // Avant la première tâche de « Terminé », ou à la fin de la liste.
  const termine = new Set(sectionTerminee(tr.doc));
  let position = 1;
  let avant: { debut: number; noeud: ProseMirrorNode } | null = null;
  for (let index = 0; index < liste.childCount && !termine.has(position); index++) {
    avant = { debut: position, noeud: liste.child(index) };
    position += liste.child(index).nodeSize;
  }
  const vide = avant !== null && avant.noeud.childCount === 1 && avant.noeud.firstChild!.content.size === 0;
  if (avant !== null && vide) {
    // Ouverture de l'item et du paragraphe.
    return avant.debut + 2;
  }
  tr.insert(position, tache);
  return position + 2;
}

interface Item {
  debut: number;
  noeud: ProseMirrorNode;
}

/**
 * Range les tâches cochées en bas de page : la section « Terminé » est la
 * suite de tâches cochées qui termine la dernière liste de tâches de premier
 * niveau. Toute tâche cochée de premier niveau ailleurs (y compris dans une
 * autre liste) va en tête de cette section, avec ses sous-tâches ; une tâche
 * décochée dans la section se retrouve donc après les tâches à faire. Les
 * sous-tâches cochées ne bougent pas. Faux si tout est déjà rangé.
 */
export function rangerTaches(tr: Transform): boolean {
  const listes: Item[] = [];
  tr.doc.forEach((bloc, debut) => {
    if (bloc.type.name === 'taskList') {
      listes.push({ debut, noeud: bloc });
    }
  });
  const derniere = listes.at(-1);
  if (derniere === undefined) {
    return false;
  }
  let debutTermine = derniere.noeud.childCount;
  while (debutTermine > 0 && derniere.noeud.child(debutTermine - 1).attrs['checked'] === true) {
    debutTermine -= 1;
  }

  // Ce qui part, en plages à retirer (une liste vidée part en entier), et les items dans l'ordre du document.
  const aRetirer: { de: number; a: number }[] = [];
  const deplaces: ProseMirrorNode[] = [];
  let pointDInsertion = derniere.debut + 1;
  for (const liste of listes) {
    const limite = liste === derniere ? debutTermine : liste.noeud.childCount;
    const plages: { de: number; a: number }[] = [];
    let position = liste.debut + 1;
    liste.noeud.forEach((item, _decalage, index) => {
      if (index < limite && item.attrs['checked'] === true) {
        plages.push({ de: position, a: position + item.nodeSize });
        deplaces.push(item);
      }
      if (liste === derniere && index < debutTermine) {
        pointDInsertion = position + item.nodeSize;
      }
      position += item.nodeSize;
    });
    if (plages.length === liste.noeud.childCount) {
      aRetirer.push({ de: liste.debut, a: liste.debut + liste.noeud.nodeSize });
    } else {
      aRetirer.push(...plages);
    }
  }
  if (deplaces.length === 0) {
    return false;
  }
  const premiereEtape = tr.steps.length;
  for (const plage of aRetirer.reverse()) {
    tr.delete(plage.de, plage.a);
  }
  tr.insert(tr.mapping.slice(premiereEtape).map(pointDInsertion), deplaces);
  return true;
}

/**
 * Positions des tâches de la section « Terminé » : la suite de tâches cochées
 * qui termine la dernière liste de tâches de premier niveau. Vide s'il n'y en
 * a pas. Sert à l'affichage (titre de section, repli).
 */
export function sectionTerminee(document: ProseMirrorNode): number[] {
  let derniere: Item | null = null;
  document.forEach((bloc, debut) => {
    if (bloc.type.name === 'taskList') {
      derniere = { debut, noeud: bloc };
    }
  });
  if (derniere === null) {
    return [];
  }
  const { debut, noeud } = derniere as Item;
  const positions: number[] = [];
  let position = debut + 1;
  noeud.forEach((item) => {
    if (item.attrs['checked'] === true) {
      positions.push(position);
    } else {
      positions.length = 0;
    }
    position += item.nodeSize;
  });
  return positions;
}
