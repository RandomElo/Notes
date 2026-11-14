import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { lireMarkdown } from '../markdown/parse';
import { ecrireMarkdown } from '../markdown/serialize';
import { schema } from '../schema/extensions';
import { modifierCorps } from './apply';
import { estTableauDeBase, remplacerTableauDeBase, tableauDeBase } from './database-table';
import type { DatabaseColumn } from './database-table';

/*
 * Base sans pages (docs/spec/base-de-donnees.md) : les lignes vivent dans le tableau écrit dans la page de la
 * base, pas dans des sous-pages. Le tableau est leur seule source : on le lit, on le change, on le réécrit, dans
 * l'ordre des lignes (le tri ne sert qu'à l'affichage). Une sous-ligne a son titre précédé de « ↳ », un par niveau.
 */

/** Une ligne d'une base sans pages : son titre, ses valeurs (forme du fichier, comme `props:`), ses sous-lignes. */
export interface TableRow {
  titre: string;
  valeurs: Record<string, string>;
  enfants: TableRow[];
}

const marqueDeNiveau = '↳';
/** Au-delà, une sous-ligne est rattachée au dernier niveau permis, comme pour les sous-pages. */
const profondeurMax = 5;

/** Une cellule du tableau ramenée à la valeur écrite pour son type : ✓ redevient `true`, « 2,5 » redevient `2.5`. */
export function valeurDeCellule(type: DatabaseColumn['type'] | undefined, texte: string): string {
  const propre = texte.trim();
  if (type === 'case') {
    return propre === '✓' || propre === 'true' ? 'true' : '';
  }
  if (type === 'nombre' && propre !== '') {
    const nombre = Number(propre.replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(nombre) ? String(nombre) : propre;
  }
  return propre;
}

/**
 * Les lignes du tableau de la base dans « document », en arbre. Les colonnes sont reconnues par le nom de leur
 * en-tête ; une colonne qui n'est pas un champ (« colonnes ») est lue comme du texte. Vide sans tableau.
 */
export function lireLignesDuTableau(document: ProseMirrorNode, colonnes: readonly DatabaseColumn[]): TableRow[] {
  let tableau: ProseMirrorNode | null = null;
  document.forEach((bloc) => {
    if (tableau === null && estTableauDeBase(bloc)) {
      tableau = bloc;
    }
  });
  if (tableau === null) {
    return [];
  }
  const rangees: ProseMirrorNode[] = [];
  (tableau as ProseMirrorNode).forEach((rangee) => rangees.push(rangee));
  const noms: string[] = [];
  rangees[0]?.forEach((cellule) => noms.push(cellule.textContent.trim()));
  const racine: TableRow[] = [];
  // Dernière ligne lue à chaque niveau : une sous-ligne se range sous celle du niveau au-dessus.
  const parents: TableRow[] = [];
  for (const rangee of rangees.slice(1)) {
    const cellules: string[] = [];
    rangee.forEach((cellule) => cellules.push(cellule.textContent));
    let titre = (cellules[0] ?? '').trim();
    let profondeur = 0;
    while (titre.startsWith(marqueDeNiveau)) {
      titre = titre.slice(marqueDeNiveau.length).trimStart();
      profondeur += 1;
    }
    const valeurs: Record<string, string> = {};
    noms.slice(1).forEach((nom, rang) => {
      const valeur = valeurDeCellule(colonnes.find((colonne) => colonne.nom === nom)?.type, cellules[rang + 1] ?? '');
      if (nom !== '' && valeur !== '') {
        valeurs[nom] = valeur;
      }
    });
    const ligne: TableRow = { titre, valeurs, enfants: [] };
    const niveau = Math.min(profondeur, parents.length, profondeurMax);
    (niveau === 0 ? racine : parents[niveau - 1]!.enfants).push(ligne);
    parents.length = niveau;
    parents.push(ligne);
  }
  return racine;
}

/** Le tableau Markdown des lignes, dans leur ordre, sous-lignes juste sous leur ligne. */
export function tableauDesLignes(colonnes: readonly DatabaseColumn[], lignes: readonly TableRow[]): string {
  const aPlat = (liste: readonly TableRow[], profondeur: number): { titre: string; valeurs: Record<string, string>; profondeur: number }[] =>
    liste.flatMap((ligne) => [{ titre: ligne.titre, valeurs: ligne.valeurs, profondeur }, ...aPlat(ligne.enfants, profondeur + 1)]);
  return tableauDeBase(colonnes, aPlat(lignes, 0));
}

/** Place d'une ligne dans l'arbre : son rang à chaque niveau (« 0/2 » : la troisième sous-ligne de la première ligne). */
export type TableRowPath = string;

const rangs = (chemin: TableRowPath): number[] => chemin.split('/').map(Number);

/** La ligne à « chemin », ou undefined. */
export function ligneA(lignes: readonly TableRow[], chemin: TableRowPath): TableRow | undefined {
  let liste = lignes;
  let trouvee: TableRow | undefined;
  for (const rang of rangs(chemin)) {
    trouvee = liste[rang];
    if (trouvee === undefined) {
      return undefined;
    }
    liste = trouvee.enfants;
  }
  return trouvee;
}

/** Les lignes où celle à « chemin » est remplacée par « changer(ligne) », ou retirée si « changer » rend null. */
export function changerLigne(lignes: readonly TableRow[], chemin: TableRowPath, changer: (ligne: TableRow) => TableRow | null): TableRow[] {
  const [rang, ...reste] = rangs(chemin);
  return lignes.flatMap((ligne, position) => {
    if (position !== rang) {
      return [ligne];
    }
    if (reste.length > 0) {
      return [{ ...ligne, enfants: changerLigne(ligne.enfants, reste.join('/'), changer) }];
    }
    const nouvelle = changer(ligne);
    return nouvelle === null ? [] : [nouvelle];
  });
}

/** Les lignes avec une ligne de plus, à la fin de la base (parent null) ou des sous-lignes de « parent ». */
export function ajouterLigne(lignes: readonly TableRow[], parent: TableRowPath | null, titre: string): TableRow[] {
  const neuve: TableRow = { titre: titre.trim(), valeurs: {}, enfants: [] };
  return parent === null ? [...lignes, neuve] : changerLigne(lignes, parent, (ligne) => ({ ...ligne, enfants: [...ligne.enfants, neuve] }));
}

/** Toutes les lignes où « changer » s'applique aux valeurs de chacune, sous-lignes comprises. */
export function changerToutesLesValeurs(lignes: readonly TableRow[], changer: (valeurs: Record<string, string>) => Record<string, string>): TableRow[] {
  return lignes.map((ligne) => ({ ...ligne, valeurs: changer(ligne.valeurs), enfants: changerToutesLesValeurs(ligne.enfants, changer) }));
}

/**
 * Change les lignes d'une base sans pages dans un corps de page (Markdown) : le tableau est lu, « changer » rend
 * les nouvelles lignes (ou null pour ne rien faire), le tableau est réécrit avec les colonnes « colonnes ».
 * Rend le nouveau corps, ou null s'il ne change pas. Sert au téléphone, qui écrit sur le NAS sous verrou.
 */
export function changerLignesDuCorps(corps: string, colonnes: readonly DatabaseColumn[], changer: (lignes: TableRow[]) => TableRow[] | null): string | null {
  return modifierCorps(
    corps,
    (tr) => {
      const nouvelles = changer(lireLignesDuTableau(tr.doc, colonnes));
      if (nouvelles !== null) {
        remplacerTableauDeBase(tr, tableauDesLignes(colonnes, nouvelles));
      }
    },
    false,
  );
}

/** Au-delà, un texte ne tient pas dans une cellule. */
const longueurMaxDeCellule = 500;

/**
 * Le texte d'un corps de page s'il tient dans une cellule : vide, ou un seul paragraphe de texte (gras et
 * italique compris, perdus), sans lien, mention, image ni saut de ligne. null sinon : la page reste une page.
 */
export function texteDeCellule(corps: string): string | null {
  const { document } = lireMarkdown(corps);
  const blocs: ProseMirrorNode[] = [];
  document.forEach((bloc) => blocs.push(bloc));
  const pleins = blocs.filter((bloc) => !(bloc.type.name === 'paragraph' && bloc.content.size === 0));
  if (pleins.length === 0) {
    return '';
  }
  const [paragraphe] = pleins;
  if (pleins.length > 1 || paragraphe!.type.name !== 'paragraph') {
    return null;
  }
  let simple = true;
  paragraphe!.forEach((enfant) => {
    if (!enfant.isText || enfant.marks.some((marque) => marque.type.name === 'link')) {
      simple = false;
    }
  });
  const texte = paragraphe!.textContent.trim();
  return simple && texte.length <= longueurMaxDeCellule ? texte : null;
}

/** Le corps d'une page fait d'un paragraphe de « texte », échappé comme il faut (« # x » reste du texte). */
export function corpsDuTexte(texte: string): string {
  if (texte.trim() === '') {
    return '';
  }
  return ecrireMarkdown(schema.node('doc', null, [schema.node('paragraph', null, [schema.text(texte.trim())])]));
}
