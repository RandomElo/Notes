import { Fragment } from '@tiptap/pm/model';
import type { NodeType, Node as ProseMirrorNode, Schema } from '@tiptap/pm/model';
import { liftListItem, sinkListItem } from '@tiptap/pm/schema-list';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import type { Command, Transaction } from '@tiptap/pm/state';
import type { Transform } from '@tiptap/pm/transform';
import { lireMarkdown } from '../markdown/parse';
import { ecrireMarkdown } from '../markdown/serialize';

/**
 * Ajoute une tâche non cochée en tête de la dernière liste de tâches de la
 * page (le champ d'ajout rapide du mode liste, docs/spec/liste-de-taches.md), ou dans une
 * nouvelle liste en fin de page s'il n'y en a pas. Le texte est pris tel
 * quel, sans Markdown. Rend la position de la fin de son texte, ou null si le
 * texte est vide.
 */
export function ajouterTache(tr: Transform, texte: string): number | null {
  const propre = texte.replace(/\s+/g, ' ').trim();
  if (propre === '') {
    return null;
  }
  const schema = tr.doc.type.schema;
  const tache = schema.nodes['taskItem']!.create({ checked: false }, schema.nodes['paragraph']!.create(null, schema.text(propre)));
  let derniere: number | null = null;
  tr.doc.forEach((bloc, debut) => {
    if (bloc.type.name === 'taskList') {
      derniere = debut;
    }
  });
  if (derniere !== null) {
    tr.insert(derniere + 1, tache);
    // Ouverture de la liste, de l'item et du paragraphe.
    return derniere + 3 + propre.length;
  }
  const liste = schema.nodes['taskList']!.create({ tight: true }, tache);
  const dernierBloc = tr.doc.lastChild;
  // Le paragraphe vide de fin de page (curseur sous le dernier bloc) laisse sa place à la liste.
  const fin = tr.doc.content.size;
  const debut = dernierBloc !== null && dernierBloc.type.name === 'paragraph' && dernierBloc.content.size === 0 ? fin - dernierBloc.nodeSize : fin;
  tr.replaceWith(debut, fin, liste);
  return debut + 3 + propre.length;
}

const typesDItem = new Set(['listItem', 'taskItem']);

function itemA(tr: Transform, position: number): ProseMirrorNode | null {
  const item = tr.doc.nodeAt(position);
  return item !== null && typesDItem.has(item.type.name) ? item : null;
}

/**
 * Contenu d'une ligne saisie sur le téléphone, en Markdown de ligne
 * (`**gras**`, `[lien](…)`). Ce qui ne donne pas un seul paragraphe (« # »,
 * « 1. » en début de ligne) est pris comme texte simple.
 */
export function contenuDeLigne(schema: Schema, texte: string): Fragment {
  const propre = texte.replace(/\s+/g, ' ').trim();
  if (propre === '') {
    return Fragment.empty;
  }
  const lu = lireMarkdown(propre).document;
  if (lu.childCount === 1 && lu.firstChild!.type.name === 'paragraph') {
    return lu.firstChild!.content;
  }
  return Fragment.from(schema.text(propre));
}

/** Le Markdown de ligne du premier paragraphe de l'item à « position », ce qu'on montre à modifier. */
export function texteDeLItem(document: ProseMirrorNode, position: number): string {
  const item = document.nodeAt(position);
  const paragraphe = item?.firstChild;
  if (paragraphe === null || paragraphe === undefined || paragraphe.type.name !== 'paragraph') {
    return '';
  }
  return ecrireMarkdown(document.type.schema.nodes['doc']!.create(null, paragraphe)).replace(/\r?\n+$/, '');
}

/** Remplace le texte (premier paragraphe) de l'item à « position ». Faux si ce n'est pas un item ou si rien ne change. */
export function modifierTexteDItem(tr: Transform, position: number, texte: string): boolean {
  const item = itemA(tr, position);
  const paragraphe = item?.firstChild;
  if (item === null || paragraphe === null || paragraphe === undefined || paragraphe.type.name !== 'paragraph') {
    return false;
  }
  const contenu = contenuDeLigne(tr.doc.type.schema, texte);
  if (contenu.eq(paragraphe.content)) {
    return false;
  }
  // Ouverture de l'item, puis du paragraphe.
  tr.replaceWith(position + 2, position + 2 + paragraphe.content.size, contenu);
  return true;
}

/** Supprime l'item à « position », sous-listes comprises ; une liste vidée part avec lui. */
export function supprimerItem(tr: Transform, position: number): boolean {
  const item = itemA(tr, position);
  if (item === null) {
    return false;
  }
  const $item = tr.doc.resolve(position);
  if ($item.parent.childCount === 1) {
    const debutListe = $item.before();
    tr.delete(debutListe, debutListe + $item.parent.nodeSize);
    if (tr.doc.childCount === 0) {
      tr.insert(0, tr.doc.type.schema.nodes['paragraph']!.create());
    }
  } else {
    tr.delete(position, position + item.nodeSize);
  }
  return true;
}

/** Déplace l'item à « position » au rang « rang » de sa liste (compté avant le déplacement). Faux s'il ne bouge pas. */
export function deplacerItem(tr: Transform, position: number, rang: number): boolean {
  const item = itemA(tr, position);
  if (item === null) {
    return false;
  }
  const $item = tr.doc.resolve(position);
  const liste = $item.parent;
  const actuel = $item.index();
  const cible = Math.max(0, Math.min(rang, liste.childCount - 1));
  if (cible === actuel) {
    return false;
  }
  tr.delete(position, position + item.nodeSize);
  let insertion = $item.start();
  const restants: ProseMirrorNode[] = [];
  liste.forEach((enfant, _decalage, index) => {
    if (index !== actuel) {
      restants.push(enfant);
    }
  });
  for (let index = 0; index < cible; index++) {
    insertion += restants[index]!.nodeSize;
  }
  tr.insert(insertion, item);
  return true;
}

/** Rang de l'item à « position » parmi tous les items du document, dans l'ordre de lecture (que décaler ne change pas). */
function rangDeLItem(document: ProseMirrorNode, position: number): number {
  let rang = -1;
  let compte = 0;
  document.descendants((noeud, debut) => {
    if (typesDItem.has(noeud.type.name)) {
      if (debut === position) {
        rang = compte;
      }
      compte += 1;
    }
  });
  return rang;
}

function positionDuRang(document: ProseMirrorNode, rang: number): number | null {
  let trouvee: number | null = null;
  let compte = 0;
  document.descendants((noeud, debut) => {
    if (typesDItem.has(noeud.type.name)) {
      if (compte === rang) {
        trouvee = debut;
      }
      compte += 1;
    }
  });
  return trouvee;
}

/**
 * Ajoute après l'item à « position » un item du même genre (puce, numéro ou
 * tâche non cochée), au même niveau, puis le décale de « decalage » niveaux
 * (+1 : sous l'item d'avant ; -1 : un niveau plus haut ; autant que
 * possible). Rend sa position, ou null si ce n'est pas un item ou si le
 * texte est vide.
 */
export function ajouterItemApres(tr: Transform, position: number, texte: string, decalage = 0): number | null {
  const item = itemA(tr, position);
  const contenu = contenuDeLigne(tr.doc.type.schema, texte);
  if (item === null || contenu.size === 0) {
    return null;
  }
  const schema = tr.doc.type.schema;
  const paragraphe = schema.nodes['paragraph']!.create(null, contenu);
  const nouveau = item.type.name === 'taskItem' ? schema.nodes['taskItem']!.create({ checked: false }, paragraphe) : schema.nodes['listItem']!.create(null, paragraphe);
  const apres = position + item.nodeSize;
  tr.insert(apres, nouveau);
  if (decalage === 0) {
    return apres;
  }
  const rang = rangDeLItem(tr.doc, apres);
  for (let fait = 0; fait < Math.abs(decalage); fait++) {
    const actuelle = positionDuRang(tr.doc, rang);
    if (actuelle === null || !(decalage > 0 ? decalerADroite(tr, actuelle) : decalerAGauche(tr, actuelle))) {
      break;
    }
  }
  return positionDuRang(tr.doc, rang);
}

/**
 * Joue une commande de liste de ProseMirror (`sinkListItem`, `liftListItem`)
 * le curseur dans l'item à « position », et reporte ses étapes dans « tr ».
 * Faux si la commande ne peut rien faire.
 */
function jouerSurLItem(tr: Transform, position: number, commande: (type: NodeType) => Command): boolean {
  const item = itemA(tr, position);
  if (item === null) {
    return false;
  }
  const etat = EditorState.create({ doc: tr.doc, selection: TextSelection.create(tr.doc, position + 2) });
  let joue: Transaction | null = null;
  commande(item.type)(etat, (transaction) => {
    joue = transaction;
  });
  if (joue === null) {
    return false;
  }
  for (const etape of (joue as Transaction).steps) {
    tr.step(etape);
  }
  return true;
}

/**
 * Décale l'item à « position » d'un cran vers la droite : il passe sous l'item
 * qui le précède, avec ses propres sous-items (« React » contient « HTML »
 * qui contient « head »). Faux pour le premier item d'une liste.
 */
export function decalerADroite(tr: Transform, position: number): boolean {
  return jouerSurLItem(tr, position, sinkListItem);
}

/** Décale l'item à « position » d'un cran vers la gauche : il ressort de l'item qui le contient. Faux au premier niveau. */
export function decalerAGauche(tr: Transform, position: number): boolean {
  if (tr.doc.resolve(position).depth < 2) {
    return false;
  }
  return jouerSurLItem(tr, position, liftListItem);
}
