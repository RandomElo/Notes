import { Extension } from '@tiptap/core';
import { Mapping } from '@tiptap/pm/transform';
import type { Transform } from '@tiptap/pm/transform';
import { Plugin } from '@tiptap/pm/state';
import { rangerTaches } from './todo-mode';

/*
 * Cocher une tâche coche aussi ses sous-tâches, à tous les niveaux (demande
 * d'Eloi du 2026-10-11 : « React » coché coche « HTML » et « head »).
 * Décocher une tâche ne décoche qu'elle.
 */

/** Coche toutes les tâches contenues dans celle qui commence à « position ». Faux s'il n'y en avait aucune à cocher. */
export function cocherLesSousTaches(tr: Transform, position: number): boolean {
  const tache = tr.doc.nodeAt(position);
  if (tache === null || tache.type.name !== 'taskItem') {
    return false;
  }
  let change = false;
  tache.descendants((enfant, decalage) => {
    if (enfant.type.name === 'taskItem' && enfant.attrs['checked'] !== true) {
      // Ouverture de la tâche, puis la position de l'enfant dans son contenu.
      tr.setNodeMarkup(position + 1 + decalage, undefined, { ...enfant.attrs, checked: true });
      change = true;
    }
  });
  return change;
}

/**
 * Coche ou décoche la tâche qui commence à « position » ; cochée, ses
 * sous-tâches le sont aussi. En mode liste, elle est ensuite rangée :
 * cochée, en tête de « Terminé » ; décochée, après les tâches à faire
 * (docs/spec/liste-de-taches.md). Faux si ce n'est pas une tâche ou si elle est déjà dans cet
 * état.
 */
export function basculerTache(tr: Transform, position: number, coche: boolean, modeListe: boolean): boolean {
  const tache = tr.doc.nodeAt(position);
  if (tache === null || tache.type.name !== 'taskItem' || tache.attrs['checked'] === coche) {
    return false;
  }
  tr.setNodeMarkup(position, undefined, { ...tache.attrs, checked: coche });
  if (coche) {
    cocherLesSousTaches(tr, position);
  }
  if (modeListe) {
    rangerTaches(tr);
  }
  return true;
}

/**
 * La même règle dans un éditeur, où la case se coche par TipTap : une tâche
 * qui vient de passer à cochée (elle ne l'était pas avant cette modification)
 * coche ses sous-tâches. Une page lue telle quelle n'est jamais touchée.
 */
export const SousTachesCochees = Extension.create({
  name: 'sousTachesCochees',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction(transactions, ancien, nouveau) {
          if (!transactions.some((transaction) => transaction.docChanged)) {
            return null;
          }
          const parcours = new Mapping();
          transactions.forEach((transaction) => parcours.appendMapping(transaction.mapping));
          const retour = parcours.invert();
          const cochees: number[] = [];
          nouveau.doc.descendants((noeud, position) => {
            if (noeud.type.name !== 'taskItem' || noeud.attrs['checked'] !== true) {
              return;
            }
            const avant = ancien.doc.nodeAt(retour.map(position, 1));
            if (avant !== null && avant.type.name === 'taskItem' && avant.attrs['checked'] !== true) {
              cochees.push(position);
            }
          });
          if (cochees.length === 0) {
            return null;
          }
          const tr = nouveau.tr;
          // Les positions ne bougent pas : cocher change un attribut, pas la taille des nœuds.
          cochees.forEach((position) => cocherLesSousTaches(tr, position));
          return tr.docChanged ? tr : null;
        },
      }),
    ];
  },
});
