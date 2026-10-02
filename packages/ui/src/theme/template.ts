import { themeParDefaut } from './defaults';
import type { Theme } from './defaults';
import { champsDuTheme, ecrireValeur, lireValeur, refus } from './fields';

/** Explication écrite au-dessus de chaque section du fichier. */
const commentaires: Record<string, string> = {
  colors: 'Palette. Partout ailleurs, une couleur peut être écrite "#rrggbb" ou par un de ces noms.',
  typography: 'Texte des pages : polices, taille et interligne.',
  heading: 'Titres. Le titre de la page tient lieu de niveau 1 : h1 est le `#` du texte, h5 le `#####`.',
  list: 'Couleur des puces selon le niveau de la liste, puis le cycle reprend.',
  code: 'Blocs de code et code dans le texte.',
  'code.syntax': 'Coloration du code.',
  callout: 'Couleur des callouts.',
  table: 'Tableaux.',
  ui: "Interface : largeur du texte, largeur de l'arborescence, arrondis, durée des transitions.",
};

/**
 * Texte d'un `theme.toml` complet pour ce thème : toutes les valeurs,
 * commentées par section. C'est ce que l'application écrit quand on crée le
 * fichier ou qu'on règle le thème depuis les réglages.
 */
export function texteDuTheme(theme: Theme): string {
  const lignes = [
    '# Thème de Notes. Ce fichier est relu dès qu\'il est enregistré : pas besoin de relancer.',
    '# Une valeur fausse est ignorée (la valeur par défaut reste) et signalée dans les réglages.',
    '# Une ligne supprimée reprend sa valeur par défaut.',
  ];
  let sectionCourante = '';
  const dits = new Set<string>();
  for (const { chemin } of champsDuTheme) {
    const morceaux = chemin.split('.');
    const section = morceaux.slice(0, -1).join('.');
    if (section !== sectionCourante) {
      lignes.push('');
      // Le commentaire d'une famille de sections (les cinq titres) ne s'écrit qu'une fois, avant la première.
      const cle = commentaires[section] === undefined ? (morceaux[0] ?? '') : section;
      const commentaire = commentaires[cle];
      if (commentaire !== undefined && !dits.has(cle)) {
        lignes.push(`# ${commentaire}`);
        dits.add(cle);
      }
      lignes.push(`[${section}]`);
      sectionCourante = section;
    }
    lignes.push(`${morceaux.at(-1)} = ${ecrire(lireValeur(theme, chemin))}`);
  }
  return `${lignes.join('\n')}\n`;
}

/** Texte d'un `theme.toml` neuf : toutes les valeurs par défaut. */
export function texteDuThemeParDefaut(): string {
  return texteDuTheme(themeParDefaut);
}

/**
 * Vérifie un thème reçu d'ailleurs (le renderer, par exemple) : chaque réglage
 * doit avoir une forme acceptée. Rend un thème propre, sans rien de plus que
 * les réglages connus, ou null si une seule valeur ne convient pas.
 */
export function verifierTheme(recu: unknown): Theme | null {
  const theme = structuredClone(themeParDefaut);
  for (const { chemin, genre } of champsDuTheme) {
    const valeur = lireValeur(recu as Theme, chemin);
    if (refus(genre, valeur) !== null) {
      return null;
    }
    ecrireValeur(theme, chemin, valeur);
  }
  return theme;
}

function ecrire(valeur: unknown): string {
  return typeof valeur === 'string' ? JSON.stringify(valeur) : String(valeur);
}
