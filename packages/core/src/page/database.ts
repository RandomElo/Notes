import { parseDocument } from 'yaml';

/*
 * Base de données (docs/spec/base-de-donnees.md) : une page en `mode: base` décrit ses champs et son tri
 * dans son en-tête (`base:`), chacune de ses sous-pages est une ligne, avec ses valeurs dans son propre
 * en-tête (`props:`). Les clés du fichier sont en anglais, comme le reste du front-matter.
 */

/**
 * Nature d'un champ : texte libre, état (liste du thème, en couleur), choix (liste propre au champ, en
 * couleur), case à cocher, nombre, adresse de courriel.
 */
export type BaseFieldType = 'texte' | 'etat' | 'choix' | 'case' | 'nombre' | 'courriel';

/** Couleurs possibles d'une valeur d'un champ « choix » : celles du thème qui servent aux états. */
export const couleursDeChoix = ['accent', 'success', 'warning', 'error', 'muted'] as const;
export type BaseChoiceColor = (typeof couleursDeChoix)[number];

/** Une valeur possible d'un champ « choix ». Sans couleur, elle prend celle de sa place dans la liste. */
export interface BaseChoice {
  nom: string;
  couleur: BaseChoiceColor | null;
}

export interface BaseField {
  nom: string;
  type: BaseFieldType;
  /** Valeurs possibles d'un champ « choix », dans l'ordre (celui du tri). Absent pour les autres types. */
  choix?: BaseChoice[];
}

export interface BaseSort {
  /** Nom d'un champ, ou `Page` pour le titre des lignes. */
  champ: string;
  sens: 'croissant' | 'decroissant';
}

export interface BaseConfig {
  champs: BaseField[];
  tri: BaseSort | null;
  /** Largeur des colonnes réglée à la main, en pixels, par nom de colonne (`Page` compris). Une colonne absente prend la place qui reste. */
  largeurs: Record<string, number>;
  /**
   * Lignes repliées : identifiants des sous-pages, ou, dans une base sans pages, chemin des titres (« Ligne / Sous-ligne »).
   * Absent ou vide : tout est déplié.
   */
  repliees?: string[];
  /** Où vivent les lignes : une sous-page par ligne (par défaut), ou les lignes du tableau écrit dans la page (base sans pages). */
  lignes?: 'pages' | 'tableau';
  /** Comment la base se montre : en tableau (par défaut) ou en liste de tâches (case, titre, valeurs en pastilles). */
  vue?: 'liste';
}

/** Bornes de la largeur d'une colonne, en pixels. */
export const largeurMinDeColonne = 60;
export const largeurMaxDeColonne = 800;

/** Nom de la colonne des titres des lignes : la première, et le repère du tableau écrit dans la page. */
export const colonneDesPages = 'Page';

/** Configuration d'une base neuve : un seul champ, son état. */
export const baseParDefaut: BaseConfig = { champs: [{ nom: 'État', type: 'etat' }], tri: null, largeurs: {} };

const typesDuFichier: Record<BaseFieldType, string> = { texte: 'text', etat: 'state', choix: 'select', case: 'checkbox', nombre: 'number', courriel: 'email' };
const typesLus = new Map(Object.entries(typesDuFichier).map(([type, cle]) => [cle, type as BaseFieldType]));

/** Au-delà, un en-tête démesuré n'est pas lu. */
const maxChamps = 30;
export const maxLignesRepliees = 500;
const formeDIdentifiant = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Vrai pour un identifiant de page bien formé (uuid en minuscules). */
export const identifiantValide = (id: string): boolean => formeDIdentifiant.test(id);

/** Séparateur du chemin des titres d'une ligne d'une base sans pages, clé de son repli. */
export const separateurDeLigne = ' / ';

/** Vrai pour une clé de ligne repliée : un identifiant de sous-page, ou un chemin de titres d'une base sans pages. */
export function cleDeRepliValide(cle: string, lignes: BaseConfig['lignes']): boolean {
  return lignes === 'tableau' ? cle.trim() !== '' && cle.length <= 2000 && !cle.includes('\n') : identifiantValide(cle);
}
const maxLongueur = 60;

function champsDe(enTete: string | null): Record<string, unknown> {
  if (enTete === null) {
    return {};
  }
  try {
    const donnees: unknown = parseDocument(enTete, { schema: 'failsafe' }).toJS();
    return typeof donnees === 'object' && donnees !== null && !Array.isArray(donnees) ? (donnees as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Vrai pour un nom de champ acceptable : non vide, court, et pas le nom de la colonne des pages. */
export function nomDeChampValide(nom: string): boolean {
  const propre = nom.trim();
  return propre !== '' && propre.length <= maxLongueur && propre !== colonneDesPages && !/[\n|]/.test(propre);
}

/** Au-delà, une liste de choix démesurée n'est pas lue. */
export const maxChoix = 50;

/** Vrai pour une valeur possible d'un champ « choix » : non vide, courte, sans | ni saut de ligne. */
export function nomDeChoixValide(nom: string): boolean {
  const propre = nom.trim();
  return propre !== '' && propre.length <= maxLongueur && !/[\n|]/.test(propre);
}

/** Couleur d'une valeur d'un champ « choix » : la sienne, sinon celle de sa place dans la liste. null : la valeur n'est pas dans la liste. */
export function couleurDuChoix(champ: BaseField, valeur: string): BaseChoiceColor | null {
  const rang = (champ.choix ?? []).findIndex((choix) => choix.nom === valeur);
  if (rang === -1) {
    return null;
  }
  return champ.choix![rang]!.couleur ?? couleursDeChoix[rang % couleursDeChoix.length]!;
}

/** Les valeurs possibles lues dans le fichier : bien formées, sans doublon. Une couleur inconnue est ignorée. */
function choixLus(options: unknown): BaseChoice[] {
  const lus: BaseChoice[] = [];
  for (const option of Array.isArray(options) ? options.slice(0, maxChoix) : []) {
    const { name, color } = (typeof option === 'object' && option !== null ? option : {}) as { name?: unknown; color?: unknown };
    if (typeof name === 'string' && nomDeChoixValide(name) && !lus.some((autre) => autre.nom === name.trim())) {
      lus.push({ nom: name.trim(), couleur: (couleursDeChoix as readonly unknown[]).includes(color) ? (color as BaseChoiceColor) : null });
    }
  }
  return lus;
}

/** La configuration d'une base, lue dans l'en-tête de sa page. null si elle n'y est pas ou est mal formée. */
export function lireConfigDeBase(enTete: string | null): BaseConfig | null {
  const brut = champsDe(enTete)['base'];
  if (typeof brut !== 'object' || brut === null || Array.isArray(brut)) {
    return null;
  }
  const { fields, sort, widths, collapsed, rows, view } = brut as { fields?: unknown; sort?: unknown; widths?: unknown; collapsed?: unknown; rows?: unknown; view?: unknown };
  if (!Array.isArray(fields)) {
    return null;
  }
  const champs: BaseField[] = [];
  for (const champ of fields.slice(0, maxChamps)) {
    const { name, type, options } = (typeof champ === 'object' && champ !== null ? champ : {}) as { name?: unknown; type?: unknown; options?: unknown };
    const nature = typeof type === 'string' ? typesLus.get(type) : undefined;
    if (typeof name === 'string' && nomDeChampValide(name) && nature !== undefined && !champs.some((autre) => autre.nom === name.trim())) {
      champs.push({ nom: name.trim(), type: nature, ...(nature === 'choix' ? { choix: choixLus(options) } : {}) });
    }
  }
  let tri: BaseSort | null = null;
  if (typeof sort === 'object' && sort !== null) {
    const { field, order } = sort as { field?: unknown; order?: unknown };
    if (typeof field === 'string' && (field === colonneDesPages || champs.some((champ) => champ.nom === field)) && (order === 'asc' || order === 'desc')) {
      tri = { champ: field, sens: order === 'asc' ? 'croissant' : 'decroissant' };
    }
  }
  const largeurs: Record<string, number> = {};
  if (typeof widths === 'object' && widths !== null && !Array.isArray(widths)) {
    for (const [nom, valeur] of Object.entries(widths)) {
      const largeur = Number(valeur);
      if ((nom === colonneDesPages || champs.some((champ) => champ.nom === nom)) && Number.isInteger(largeur) && largeur >= largeurMinDeColonne && largeur <= largeurMaxDeColonne) {
        largeurs[nom] = largeur;
      }
    }
  }
  const lignes = rows === 'table' ? 'tableau' : 'pages';
  const repliees = Array.isArray(collapsed) ? [...new Set(collapsed.filter((cle): cle is string => typeof cle === 'string' && cleDeRepliValide(cle, lignes)))].slice(0, maxLignesRepliees) : [];
  return { champs, tri, largeurs, repliees, ...(lignes === 'tableau' ? { lignes } : {}), ...(view === 'list' ? { vue: 'liste' as const } : {}) };
}

/** La configuration telle qu'elle s'écrit dans l'en-tête (clés anglaises). */
export function configEnYaml(config: BaseConfig): Record<string, unknown> {
  return {
    fields: config.champs.map((champ) => ({
      name: champ.nom,
      type: typesDuFichier[champ.type],
      ...(champ.type === 'choix' ? { options: (champ.choix ?? []).map((choix) => ({ name: choix.nom, ...(choix.couleur === null ? {} : { color: choix.couleur }) })) } : {}),
    })),
    ...(config.tri === null ? {} : { sort: { field: config.tri.champ, order: config.tri.sens === 'croissant' ? 'asc' : 'desc' } }),
    ...(Object.keys(config.largeurs).length === 0 ? {} : { widths: config.largeurs }),
    ...((config.repliees ?? []).length === 0 ? {} : { collapsed: config.repliees }),
    ...(config.lignes === 'tableau' ? { rows: 'table' } : {}),
    ...(config.vue === 'liste' ? { view: 'list' } : {}),
  };
}

/** Les valeurs d'une ligne (`props:` de sa sous-page), en texte. Vide s'il n'y en a pas. */
export function lireValeurs(enTete: string | null): Record<string, string> {
  const brut = champsDe(enTete)['props'];
  if (typeof brut !== 'object' || brut === null || Array.isArray(brut)) {
    return {};
  }
  const valeurs: Record<string, string> = {};
  for (const [nom, valeur] of Object.entries(brut).slice(0, maxChamps)) {
    if (typeof valeur === 'string') {
      valeurs[nom] = valeur;
    }
  }
  return valeurs;
}

/**
 * Une valeur saisie, ramenée à ce qu'on écrit pour ce type de champ. null : la valeur est vide
 * et la clé se retire. Une saisie qui ne convient pas (lettres dans un nombre) est refusée.
 */
export function valeurPourLeChamp(type: BaseFieldType, saisie: string): { ok: true; valeur: string | null } | { ok: false; message: string } {
  const propre = saisie.trim();
  if (propre === '') {
    return { ok: true, valeur: null };
  }
  switch (type) {
    case 'case':
      return propre === 'true' || propre === 'false' ? { ok: true, valeur: propre === 'true' ? 'true' : null } : { ok: false, message: 'Une case est cochée ou non.' };
    case 'nombre': {
      const nombre = Number(propre.replace(',', '.').replace(/\s/g, ''));
      return Number.isFinite(nombre) ? { ok: true, valeur: String(nombre) } : { ok: false, message: 'Un nombre est attendu, comme 12 ou 3,5.' };
    }
    case 'choix':
      return nomDeChoixValide(propre) ? { ok: true, valeur: propre } : { ok: false, message: `Un choix tient en ${maxLongueur} caractères, sans | ni saut de ligne.` };
    case 'courriel':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(propre) ? { ok: true, valeur: propre } : { ok: false, message: 'Une adresse comme nom@exemple.fr est attendue.' };
    default:
      return propre.length > 500 ? { ok: false, message: '500 caractères au plus.' } : { ok: true, valeur: propre.replace(/\s*\n\s*/g, ' ') };
  }
}
