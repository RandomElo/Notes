import { Fragment } from '@tiptap/pm/model';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { Transform } from '@tiptap/pm/transform';
import { lireMarkdown } from '../markdown/parse';
import { ecrireMarkdown } from '../markdown/serialize';
import { prefixeDeLienInterne } from '../schema/nodes/page-mention';

/*
 * Le tableau d'une base de données (docs/spec/base-de-donnees.md) : l'état du moment des lignes, écrit en
 * Markdown ordinaire dans le corps de la page de la base, pour qu'elle se lise sans l'application.
 * L'application le refait à chaque changement ; on le reconnaît à sa première colonne, « Page ».
 * Les types reprennent ceux du core (`BaseField`, `BaseRow`) sans en dépendre.
 */

export interface DatabaseColumn {
  nom: string;
  type: 'texte' | 'etat' | 'choix' | 'case' | 'nombre' | 'courriel';
  /** Valeurs possibles d'un champ « choix », dans l'ordre du tri. */
  choix?: readonly { nom: string }[];
}

export interface DatabaseRow {
  /** Identifiant de la sous-page de la ligne : son titre s'écrit en mention. Absent (base sans pages) : en texte. */
  id?: string;
  titre: string;
  valeurs: Record<string, string>;
  /** Sous-lignes : les sous-pages de la ligne. */
  enfants?: DatabaseRow[];
}

export interface DatabaseSort {
  champ: string;
  sens: 'croissant' | 'decroissant';
}

/** Nom de la première colonne : le titre des lignes, et le repère du tableau de la base. */
const colonneDesPages = 'Page';

const comparerTexte = (a: string, b: string): number => a.localeCompare(b, 'fr', { sensitivity: 'base', numeric: true });

/**
 * Les lignes dans l'ordre du tri. Une valeur vide va toujours à la fin, quel que soit le sens. Un état
 * suit l'ordre de la liste des états du thème, un choix celui de la liste du champ ; une case cochée vient avant une case vide (croissant).
 * Sans tri, l'ordre des sous-pages est gardé.
 */
export function trierLignes<Ligne extends DatabaseRow>(lignes: readonly Ligne[], colonnes: readonly DatabaseColumn[], tri: DatabaseSort | null, ordreDesEtats: readonly string[]): Ligne[] {
  if (tri === null) {
    return [...lignes];
  }
  const colonne = colonnes.find((candidate) => candidate.nom === tri.champ);
  if (tri.champ !== colonneDesPages && colonne === undefined) {
    return [...lignes];
  }
  const valeur = (ligne: Ligne): string => (tri.champ === colonneDesPages ? ligne.titre : (ligne.valeurs[tri.champ] ?? ''));
  const comparer = (a: string, b: string): number => {
    switch (colonne?.type) {
      case 'nombre':
        return Number(a) - Number(b);
      case 'etat': {
        const rang = (etat: string): number => {
          const trouve = ordreDesEtats.indexOf(etat);
          return trouve === -1 ? ordreDesEtats.length : trouve;
        };
        return rang(a) - rang(b) || comparerTexte(a, b);
      }
      case 'choix': {
        const noms = (colonne.choix ?? []).map((choix) => choix.nom);
        const rang = (choix: string): number => {
          const trouve = noms.indexOf(choix);
          return trouve === -1 ? noms.length : trouve;
        };
        return rang(a) - rang(b) || comparerTexte(a, b);
      }
      default:
        return comparerTexte(a, b);
    }
  };
  const signe = tri.sens === 'croissant' ? 1 : -1;
  return lignes
    .map((ligne, rang) => ({ ligne, rang }))
    .sort((x, y) => {
      const a = valeur(x.ligne);
      const b = valeur(y.ligne);
      // Une case non cochée n'a pas de valeur : c'est une vraie valeur, « non », pas un manque.
      const videA = a === '' && colonne?.type !== 'case';
      const videB = b === '' && colonne?.type !== 'case';
      if (videA !== videB) {
        return videA ? 1 : -1;
      }
      if (colonne?.type === 'case') {
        return signe * ((b === 'true' ? 1 : 0) - (a === 'true' ? 1 : 0)) || x.rang - y.rang;
      }
      return signe * comparer(a, b) || x.rang - y.rang;
    })
    .map(({ ligne }) => ligne);
}

/**
 * Les lignes et leurs sous-lignes à plat, dans l'ordre d'affichage : chaque niveau trié à part, une sous-ligne
 * juste sous sa ligne. « profondeur » : 0 pour une ligne, 1 pour une sous-ligne…
 */
export function aplatirLignes<Ligne extends DatabaseRow & { enfants?: Ligne[] }>(
  lignes: readonly Ligne[],
  colonnes: readonly DatabaseColumn[],
  tri: DatabaseSort | null,
  ordreDesEtats: readonly string[],
  profondeur = 0,
): { ligne: Ligne; profondeur: number }[] {
  return trierLignes(lignes, colonnes, tri, ordreDesEtats).flatMap((ligne) => [{ ligne, profondeur }, ...aplatirLignes(ligne.enfants ?? [], colonnes, tri, ordreDesEtats, profondeur + 1)]);
}

/** Un texte sûr dans une cellule : les caractères qui feraient du Markdown sont échappés, pas de saut de ligne. */
function enCellule(texte: string): string {
  return texte.replace(/\s*\n\s*/g, ' ').replace(/[\\|[\]*_`<>~#!]/g, (caractere) => `\\${caractere}`);
}

/** Ce qu'affiche une valeur dans le tableau écrit : une case cochée en ✓, un nombre à la française. */
export function valeurAffichee(type: DatabaseColumn['type'], valeur: string | undefined): string {
  if (valeur === undefined || valeur === '') {
    return '';
  }
  if (type === 'case') {
    return valeur === 'true' ? '✓' : '';
  }
  if (type === 'nombre' && Number.isFinite(Number(valeur))) {
    return Number(valeur).toLocaleString('fr-FR', { maximumFractionDigits: 6 });
  }
  return valeur;
}

/**
 * Le tableau Markdown de la base : la colonne des pages (mentions), puis un champ par colonne. Une sous-ligne
 * (« profondeur » donnée) est marquée « ↳ » devant son titre, une fois par niveau.
 */
export function tableauDeBase(colonnes: readonly DatabaseColumn[], lignes: readonly (DatabaseRow & { profondeur?: number })[]): string {
  const ligne = (cellules: string[]): string => `| ${cellules.join(' | ')} |`;
  return [
    ligne([colonneDesPages, ...colonnes.map((colonne) => enCellule(colonne.nom))]),
    ligne([colonneDesPages, ...colonnes].map(() => '---')),
    ...lignes.map((rangee) =>
      ligne([`${'↳ '.repeat(rangee.profondeur ?? 0)}${rangee.id === undefined ? enCellule(rangee.titre) : `[${enCellule(rangee.titre)}](${prefixeDeLienInterne}${rangee.id})`}`, ...colonnes.map((colonne) => enCellule(valeurAffichee(colonne.type, rangee.valeurs[colonne.nom])))]),
    ),
  ].join('\n');
}

/** Vrai pour le tableau d'une base : un tableau dont la première cellule d'en-tête est « Page ». */
export function estTableauDeBase(noeud: ProseMirrorNode): boolean {
  return noeud.type.name === 'table' && noeud.firstChild?.firstChild?.textContent.trim() === colonneDesPages;
}

/**
 * Remplace le tableau de la base par « markdown » (rendu par `tableauDeBase`), ou l'ajoute à la fin de
 * la page s'il n'y en a pas. Faux si rien ne change.
 */
export function remplacerTableauDeBase(tr: Transform, markdown: string): boolean {
  const neuf = lireMarkdown(`${markdown}\n`).document.firstChild;
  if (neuf === null || neuf.type.name !== 'table') {
    return false;
  }
  // Le schéma de la page peut être celui d'un éditeur, construit à part : le tableau y est recréé.
  const tableau = tr.doc.type.schema === neuf.type.schema ? neuf : tr.doc.type.schema.nodeFromJSON(neuf.toJSON());
  let place: { de: number; a: number } | null = null;
  tr.doc.forEach((bloc, debut) => {
    if (place === null && estTableauDeBase(bloc)) {
      place = { de: debut, a: debut + bloc.nodeSize };
    }
  });
  if (place === null) {
    const dernier = tr.doc.lastChild;
    // Une page vide (un paragraphe vide) : le tableau prend sa place.
    if (tr.doc.childCount === 1 && dernier?.type.name === 'paragraph' && dernier.content.size === 0) {
      tr.replaceWith(0, tr.doc.content.size, tableau);
    } else {
      tr.insert(tr.doc.content.size, tableau);
    }
    return true;
  }
  const { de, a } = place as { de: number; a: number };
  const ancien = tr.doc.slice(de, a).content.firstChild;
  // Les largeurs de colonnes réglées à la main ne comptent pas : seul le contenu dit si le tableau a changé.
  if (ancien !== null && ancien.content.eq(tableau.content)) {
    return false;
  }
  tr.replaceWith(de, a, tableau);
  return true;
}

/** Le corps d'une page de base sans son tableau écrit, pour la lecture seule : la vue de la base le montre déjà. */
export function sansTableauDeBase(corps: string): string {
  const { document, source } = lireMarkdown(corps);
  const garde = document.content.content.filter((bloc) => !estTableauDeBase(bloc));
  return garde.length === document.childCount ? corps : ecrireMarkdown(document.copy(Fragment.fromArray(garde)), source);
}
