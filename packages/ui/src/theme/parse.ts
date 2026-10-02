import { TomlError, parse } from 'smol-toml';
import { themeParDefaut } from './defaults';
import type { Theme } from './defaults';
import { champsDuTheme, ecrireValeur, refus } from './fields';

export interface ParsedTheme {
  theme: Theme;
  /** Ce qui a été ignoré dans le fichier, en clair. Vide si tout est bon. */
  avertissements: string[];
}

/** Au-delà, le reste est résumé : un fichier très faux ne doit pas noyer l'écran. */
const maxAvertissements = 12;

const estTable = (valeur: unknown): valeur is Record<string, unknown> =>
  typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur) && !(valeur instanceof Date);

/**
 * Lit le texte de `theme.toml`. Validation tolérante (README §8) : une valeur
 * fausse ou une clé inconnue est ignorée, le défaut reste en place et un
 * avertissement le dit. Un fichier illisible donne le thème par défaut. Cette
 * fonction ne lève jamais d'erreur.
 */
export function lireTheme(texte: string | null): ParsedTheme {
  const theme = structuredClone(themeParDefaut);
  if (texte === null || texte.trim() === '') {
    return { theme, avertissements: [] };
  }

  let donnees: unknown;
  try {
    donnees = parse(texte);
  } catch (erreur) {
    const ou = erreur instanceof TomlError ? ` (ligne ${erreur.line})` : '';
    return { theme, avertissements: [`Le fichier n'est pas lisible${ou}. Le thème par défaut est utilisé.`] };
  }

  const avertissements: string[] = [];
  const genres = new Map(champsDuTheme.map((champ) => [champ.chemin, champ.genre]));
  const sections = new Set(champsDuTheme.flatMap((champ) => prefixes(champ.chemin)));

  const parcourir = (table: Record<string, unknown>, prefixe: string): void => {
    for (const [cle, valeur] of Object.entries(table)) {
      const chemin = prefixe === '' ? cle : `${prefixe}.${cle}`;
      const genre = genres.get(chemin);
      if (genre !== undefined) {
        const attendu = refus(genre, valeur);
        if (attendu === null) {
          ecrireValeur(theme, chemin, valeur);
        } else {
          avertissements.push(`${chemin} : ${montrer(valeur)} n'est pas ${attendu}. La valeur par défaut est gardée.`);
        }
      } else if (sections.has(chemin)) {
        if (estTable(valeur)) {
          parcourir(valeur, chemin);
        } else {
          avertissements.push(`${chemin} est une section : elle s'écrit [${chemin}], suivie de ses réglages.`);
        }
      } else {
        avertissements.push(`${chemin} : réglage inconnu, ignoré.`);
      }
    }
  };
  if (estTable(donnees)) {
    parcourir(donnees, '');
  }

  if (avertissements.length > maxAvertissements) {
    const autres = avertissements.length - maxAvertissements;
    avertissements.length = maxAvertissements;
    avertissements.push(`Et ${autres} autre${autres > 1 ? 's' : ''}.`);
  }
  return { theme, avertissements };
}

/** `heading.h2.size` → `heading`, `heading.h2`. */
function prefixes(chemin: string): string[] {
  const morceaux = chemin.split('.');
  return morceaux.slice(1).map((_morceau, index) => morceaux.slice(0, index + 1).join('.'));
}

/** La valeur fautive telle qu'on peut la reconnaître dans le fichier, raccourcie. */
function montrer(valeur: unknown): string {
  const texte = typeof valeur === 'string' ? `"${valeur}"` : estTable(valeur) || Array.isArray(valeur) ? 'cette valeur' : String(valeur);
  return texte.length > 40 ? `${texte.slice(0, 40)}…` : texte;
}
