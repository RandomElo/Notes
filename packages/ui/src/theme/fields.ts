import { niveauxDeTitre, nomsDeCouleur } from './defaults';
import type { Theme } from './defaults';

/** Nature d'une valeur du thème : c'est elle qui dit ce qui est accepté. */
export type FieldKind = 'couleur' | 'reference' | 'taille' | 'graisse' | 'booleen' | 'interligne' | 'police' | 'duree';

export interface ThemeField {
  /** Chemin dans le TOML et dans l'objet du thème : `heading.h2.size`. */
  chemin: string;
  genre: FieldKind;
}

const champ = (chemin: string, genre: FieldKind): ThemeField => ({ chemin, genre });

/** Toutes les valeurs réglables, dans l'ordre où elles s'écrivent dans le fichier. */
export const champsDuTheme: ThemeField[] = [
  ...nomsDeCouleur.map((nom) => champ(`colors.${nom}`, 'couleur')),
  champ('typography.font', 'police'),
  champ('typography.mono', 'police'),
  champ('typography.size', 'taille'),
  champ('typography.line_height', 'interligne'),
  ...niveauxDeTitre.flatMap((niveau) => [
    champ(`heading.${niveau}.size`, 'taille'),
    champ(`heading.${niveau}.weight`, 'graisse'),
    champ(`heading.${niveau}.italic`, 'booleen'),
    champ(`heading.${niveau}.underline`, 'booleen'),
    champ(`heading.${niveau}.color`, 'reference'),
    champ(`heading.${niveau}.margin_top`, 'taille'),
  ]),
  champ('list.bullet_1', 'reference'),
  champ('list.bullet_2', 'reference'),
  champ('list.bullet_3', 'reference'),
  champ('code.background', 'reference'),
  champ('code.font_size', 'taille'),
  champ('code.line_numbers', 'booleen'),
  champ('code.wrap', 'booleen'),
  ...['text', 'comment', 'keyword', 'control', 'string', 'regex', 'number', 'function', 'type', 'variable', 'tag', 'attribute'].map((nom) => champ(`code.syntax.${nom}`, 'reference')),
  ...['info', 'success', 'warning', 'danger'].map((nom) => champ(`callout.${nom}`, 'reference')),
  champ('table.border', 'reference'),
  champ('table.header_background', 'reference'),
  champ('ui.content_width', 'taille'),
  champ('ui.sidebar_width', 'taille'),
  champ('ui.radius', 'taille'),
  champ('ui.transition', 'duree'),
];

const couleur = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const taille = /^(?:\d{1,4}(?:\.\d{1,3})?|\.\d{1,3})(?:rem|em|px|%)$/;
const police = /^[\p{L}\p{N} ,'"._-]{1,200}$/u;
const duree = /^\d{1,4}ms$/;

export function estCouleur(valeur: unknown): valeur is string {
  return typeof valeur === 'string' && couleur.test(valeur);
}

/**
 * Vérifie une valeur lue dans le fichier. Rend null si elle convient, sinon ce
 * qui était attendu, en clair. Le contenu du fichier n'est pas de confiance :
 * rien d'autre que ces formes ne passe dans une variable CSS.
 */
export function refus(genre: FieldKind, valeur: unknown): string | null {
  switch (genre) {
    case 'couleur':
      return estCouleur(valeur) ? null : 'une couleur comme "#7aa2f7"';
    case 'reference':
      return estCouleur(valeur) || (nomsDeCouleur as readonly unknown[]).includes(valeur)
        ? null
        : `une couleur comme "#7aa2f7" ou le nom d'une couleur de [colors] (${nomsDeCouleur.join(', ')})`;
    case 'taille':
      return typeof valeur === 'string' && taille.test(valeur) ? null : 'une taille comme "1.3rem", "20px" ou "1.2em"';
    case 'graisse':
      return typeof valeur === 'number' && Number.isInteger(valeur) && valeur >= 100 && valeur <= 900 && valeur % 100 === 0
        ? null
        : 'une graisse de 100 à 900, par centaines (400 normal, 700 gras)';
    case 'booleen':
      return typeof valeur === 'boolean' ? null : 'true ou false, sans guillemets';
    case 'interligne':
      return typeof valeur === 'number' && valeur >= 1 && valeur <= 3 ? null : 'un nombre entre 1 et 3, sans guillemets';
    case 'police':
      return typeof valeur === 'string' && police.test(valeur) ? null : 'un nom de police, ou plusieurs séparés par des virgules';
    case 'duree':
      return typeof valeur === 'string' && duree.test(valeur) ? null : 'une durée comme "150ms"';
  }
}

/** La valeur d'un réglage du thème, par son chemin (`heading.h2.size`). */
export function lireValeur(theme: Theme, chemin: string): unknown {
  let valeur: unknown = theme;
  for (const morceau of chemin.split('.')) {
    valeur = typeof valeur === 'object' && valeur !== null ? (valeur as Record<string, unknown>)[morceau] : undefined;
  }
  return valeur;
}

/** Écrit un réglage dans le thème donné, par son chemin. Le chemin doit être celui d'un réglage connu. */
export function ecrireValeur(theme: Theme, chemin: string, valeur: unknown): void {
  const morceaux = chemin.split('.');
  let cible = theme as unknown as Record<string, unknown>;
  for (const morceau of morceaux.slice(0, -1)) {
    cible = cible[morceau] as Record<string, unknown>;
  }
  cible[morceaux.at(-1) as string] = valeur;
}
