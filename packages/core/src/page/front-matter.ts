import { Document, isMap, parseDocument } from 'yaml';
import { estId } from './id';
import type { PageMeta, PageMode, PageRole } from './types';

/**
 * Front-matter YAML d'une page. Les clés du fichier sont en anglais (id,
 * title, icon, created, updated, mode), comme décrit dans docs/spec/stockage.md.
 *
 * Règle : on ne réécrit que ce qu'on change. Les clés inconnues, les
 * commentaires et l'ordre des clés d'un front-matter existant sont conservés.
 */

export interface FrontMatterSplit {
  /** Marque d'ordre d'octets éventuelle, à remettre telle quelle. */
  bom: string;
  /** Bloc YAML sans ses délimiteurs, null si la page n'a pas de front-matter. */
  enTete: string | null;
  corps: string;
  /** Fin de ligne utilisée par le front-matter, reprise à la réécriture. */
  finDeLigne: '\n' | '\r\n';
  /** Ce qui suit le « --- » de fermeture : une fin de ligne, ou rien si le fichier s'arrête là. */
  apresFermeture: string;
}

/** Sépare le front-matter du corps, sans rien interpréter. */
export function decouperPage(texte: string): FrontMatterSplit {
  const bom = texte.startsWith('\uFEFF') ? '\uFEFF' : '';
  const sansBom = texte.slice(bom.length);
  const ouverture = /^---(\r?\n)/.exec(sansBom);
  if (ouverture === null) {
    return { bom, enTete: null, corps: sansBom, finDeLigne: '\n', apresFermeture: '' };
  }
  const finDeLigne = ouverture[1] === '\r\n' ? '\r\n' : '\n';
  const debut = ouverture[0].length;
  // La fermeture est une ligne « --- » seule : juste après l'ouverture (front-matter vide) ou plus loin.
  const fermeture = /(^|\r?\n)---(\r?\n|$)/.exec(sansBom.slice(debut));
  if (fermeture === null) {
    return { bom, enTete: null, corps: sansBom, finDeLigne: '\n', apresFermeture: '' };
  }
  return {
    bom,
    enTete: sansBom.slice(debut, debut + fermeture.index),
    corps: sansBom.slice(debut + fermeture.index + fermeture[0].length),
    finDeLigne,
    apresFermeture: fermeture[2] ?? '',
  };
}

/** Réassemble une page. Inverse exact de decouperPage quand rien n'a changé. */
export function assemblerPage(morceaux: FrontMatterSplit): string {
  if (morceaux.enTete === null) {
    return morceaux.bom + morceaux.corps;
  }
  const fin = morceaux.finDeLigne;
  const bloc = morceaux.enTete === '' ? '' : morceaux.enTete + fin;
  return `${morceaux.bom}---${fin}${bloc}---${morceaux.apresFermeture}${morceaux.corps}`;
}

/**
 * Lit le YAML en gardant chaque valeur simple sous forme de texte. Sans cela,
 * un titre comme « 2026 » ou « oui » serait pris pour un nombre ou un booléen,
 * et une date pour un objet Date. null si le bloc n'est pas une liste de clés.
 */
function lireChampsTexte(enTete: string): Record<string, unknown> | null {
  try {
    const donnees: unknown = parseDocument(enTete, { schema: 'failsafe' }).toJS();
    return typeof donnees === 'object' && donnees !== null && !Array.isArray(donnees)
      ? (donnees as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Lit les métadonnées. null si le YAML est illisible ou s'il lui manque un identifiant ou un titre valides. */
export function lireMeta(enTete: string | null): PageMeta | null {
  if (enTete === null) {
    return null;
  }
  const champs = lireChampsTexte(enTete);
  if (champs === null) {
    return null;
  }
  const titre = champs['title'];
  if (!estId(champs['id']) || typeof titre !== 'string' || titre.trim() === '') {
    return null;
  }
  return {
    id: champs['id'],
    titre: titre.trim(),
    icone: typeof champs['icon'] === 'string' && champs['icon'] !== '' ? champs['icon'] : null,
    creeLe: texteDeDate(champs['created']),
    modifieLe: texteDeDate(champs['updated']),
    mode: champs['mode'] === 'todo' ? 'todo' : null,
    ...(champs['role'] === 'memos' ? { role: 'memos' as const } : {}),
  };
}

/**
 * Surcharges de thème d'une page (`theme_overrides`), telles qu'elles sont
 * écrites : des paires clé et texte. Leur sens et leur validité sont l'affaire
 * du thème, pas de core. Vide s'il n'y en a pas ou si le champ est mal formé.
 */
export function lireSurcharges(enTete: string | null): Record<string, string> {
  const champs = (enTete === null ? null : lireChampsTexte(enTete)) ?? {};
  const brut = champs['theme_overrides'];
  if (typeof brut !== 'object' || brut === null || Array.isArray(brut)) {
    return {};
  }
  const surcharges: Record<string, string> = {};
  for (const [cle, valeur] of Object.entries(brut)) {
    if (typeof valeur === 'string' && Object.keys(surcharges).length < 50) {
      surcharges[cle] = valeur;
    }
  }
  return surcharges;
}

/** Au plus ce nombre de tableaux et de colonnes par tableau : un en-tête démesuré n'est pas lu. */
const maxTableaux = 200;
const maxColonnes = 50;

/**
 * Largeur des colonnes de chaque tableau (`table_widths`, docs/spec/stockage.md) :
 * une liste par tableau, dans l'ordre de la page, en pourcentages entiers de la
 * largeur du tableau. Une liste vide, ou mal formée, laisse les colonnes égales.
 */
export function lireLargeursDesTableaux(enTete: string | null): number[][] {
  const champs = (enTete === null ? null : lireChampsTexte(enTete)) ?? {};
  const brut = champs['table_widths'];
  if (!Array.isArray(brut)) {
    return [];
  }
  return brut.slice(0, maxTableaux).map((tableau: unknown) => {
    if (!Array.isArray(tableau) || tableau.length > maxColonnes) {
      return [];
    }
    const largeurs = tableau.map((valeur: unknown) => Number(valeur));
    return largeurs.every((largeur) => Number.isInteger(largeur) && largeur > 0 && largeur <= 100) ? largeurs : [];
  });
}

/**
 * Champs texte déjà présents dans un front-matter incomplet (page venue d'un
 * autre outil), pour les garder à l'import plutôt que de les écraser.
 */
export function lireChampsExistants(enTete: string | null): { titre: string | null; creeLe: string | null } {
  const champs = (enTete === null ? null : lireChampsTexte(enTete)) ?? {};
  const titre = champs['title'];
  const creeLe = texteDeDate(champs['created']);
  return {
    titre: typeof titre === 'string' && titre.trim() !== '' ? titre.trim() : null,
    creeLe: creeLe === '' ? null : creeLe,
  };
}

// YAML reconnaît les dates ISO et en fait des objets Date : on revient au texte.
function texteDeDate(valeur: unknown): string {
  if (valeur instanceof Date && !Number.isNaN(valeur.getTime())) {
    return valeur.toISOString();
  }
  return typeof valeur === 'string' ? valeur : '';
}

export interface FrontMatterChanges {
  id?: string;
  titre?: string;
  icone?: string | null;
  creeLe?: string;
  modifieLe?: string;
  mode?: PageMode | null;
  role?: PageRole | null;
  /** Largeurs des colonnes des tableaux ; une liste sans aucune largeur retire la clé. */
  largeursDesTableaux?: number[][] | null;
}

const cles: Record<keyof FrontMatterChanges, string> = {
  id: 'id',
  titre: 'title',
  icone: 'icon',
  creeLe: 'created',
  modifieLe: 'updated',
  mode: 'mode',
  role: 'role',
  largeursDesTableaux: 'table_widths',
};

/**
 * Applique des changements à un front-matter (ou en crée un) et renvoie le
 * nouveau bloc YAML. Une valeur null retire la clé. Tout le reste du bloc est
 * conservé.
 */
export function modifierEnTete(enTete: string | null, changements: FrontMatterChanges): string {
  const existant = parseDocument(enTete ?? '');
  // Front-matter absent, vide ou qui n'est pas une liste de clés : on repart d'une liste vide.
  const document: Document = isMap(existant.contents) ? existant : new Document({});
  for (const [champ, cle] of Object.entries(cles) as [keyof FrontMatterChanges, string][]) {
    if (!(champ in changements)) {
      continue;
    }
    const valeur = changements[champ];
    if (valeur === null || valeur === undefined || (Array.isArray(valeur) && valeur.every((tableau) => tableau.length === 0))) {
      document.delete(cle);
    } else if (Array.isArray(valeur)) {
      // Une ligne par tableau, ses largeurs entre crochets : `- [30, 70]`.
      const noeud = document.createNode(valeur);
      for (const tableau of noeud.items) {
        (tableau as { flow?: boolean }).flow = true;
      }
      document.set(cle, noeud);
    } else {
      document.set(cle, valeur);
    }
  }
  return document.toString({ lineWidth: 0, flowCollectionPadding: false }).replace(/\r?\n$/, '');
}
