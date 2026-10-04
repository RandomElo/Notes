import { niveauxDeTitre, nomsDeCouleur } from './defaults';
import type { ColorName, Theme } from './defaults';
import { estCouleur } from './fields';

/** Nom de la variable CSS de chaque couleur de la palette (jetons Tailwind de `styles/theme.css`). */
export const variableDeCouleur: Record<ColorName, string> = {
  background: '--color-fond',
  surface: '--color-surface',
  border: '--color-bordure',
  text: '--color-texte',
  muted: '--color-discret',
  accent: '--color-accent',
  success: '--color-succes',
  warning: '--color-alerte',
  error: '--color-erreur',
};

/**
 * Une couleur du thème en CSS. Un nom de la palette devient un renvoi à sa
 * variable, pas sa valeur : une page qui surcharge une couleur change ainsi
 * tout ce qui en dépend.
 */
function couleur(valeur: string): string {
  return (nomsDeCouleur as readonly string[]).includes(valeur) ? `var(${variableDeCouleur[valeur as ColorName]})` : valeur;
}

/** Le thème en variables CSS, à poser sur la racine du document (README §8). */
export function variablesDuTheme(theme: Theme): Record<string, string> {
  const variables: Record<string, string> = {};
  for (const nom of nomsDeCouleur) {
    variables[variableDeCouleur[nom]] = theme.colors[nom];
  }

  variables['--font-sans'] = theme.typography.font;
  variables['--font-mono'] = theme.typography.mono;
  variables['--page-taille'] = theme.typography.size;
  variables['--page-interligne'] = String(theme.typography.line_height);

  for (const niveau of niveauxDeTitre) {
    const titre = theme.heading[niveau];
    variables[`--page-${niveau}-taille`] = titre.size;
    variables[`--page-${niveau}-graisse`] = String(titre.weight);
    variables[`--page-${niveau}-style`] = titre.italic ? 'italic' : 'normal';
    variables[`--page-${niveau}-trait`] = titre.underline ? 'underline' : 'none';
    variables[`--page-${niveau}-couleur`] = couleur(titre.color);
    variables[`--page-${niveau}-marge`] = titre.margin_top;
  }

  variables['--page-puce-1'] = couleur(theme.list.bullet_1);
  variables['--page-puce-2'] = couleur(theme.list.bullet_2);
  variables['--page-puce-3'] = couleur(theme.list.bullet_3);

  variables['--page-fond-code'] = couleur(theme.code.background);
  variables['--page-code-taille'] = theme.code.font_size;
  variables['--code-retour'] = theme.code.wrap ? 'pre-wrap' : 'pre';
  variables['--code-numeros'] = theme.code.line_numbers ? 'inline-block' : 'none';
  variables['--code-marge-numeros'] = theme.code.line_numbers ? '2em' : '0em';
  variables['--code-texte'] = couleur(theme.code.syntax.text);
  variables['--code-commentaire'] = couleur(theme.code.syntax.comment);
  variables['--code-mot-cle'] = couleur(theme.code.syntax.keyword);
  variables['--code-controle'] = couleur(theme.code.syntax.control);
  variables['--code-chaine'] = couleur(theme.code.syntax.string);
  variables['--code-regex'] = couleur(theme.code.syntax.regex);
  variables['--code-nombre'] = couleur(theme.code.syntax.number);
  variables['--code-fonction'] = couleur(theme.code.syntax.function);
  variables['--code-type'] = couleur(theme.code.syntax.type);
  variables['--code-variable'] = couleur(theme.code.syntax.variable);
  variables['--code-balise'] = couleur(theme.code.syntax.tag);
  variables['--code-attribut'] = couleur(theme.code.syntax.attribute);
  variables['--callout-info'] = couleur(theme.callout.info);
  variables['--callout-succes'] = couleur(theme.callout.success);
  variables['--callout-alerte'] = couleur(theme.callout.warning);
  variables['--callout-danger'] = couleur(theme.callout.danger);
  variables['--tableau-bordure'] = couleur(theme.table.border);
  variables['--tableau-entete'] = couleur(theme.table.header_background);

  variables['--ui-largeur-contenu'] = theme.ui.content_width;
  variables['--ui-largeur-barre'] = theme.ui.sidebar_width;
  variables['--radius-sm'] = `calc(${theme.ui.radius} * 2 / 3)`;
  variables['--radius-md'] = theme.ui.radius;
  variables['--radius-lg'] = `calc(${theme.ui.radius} * 4 / 3)`;
  variables['--default-transition-duration'] = theme.ui.transition;
  return variables;
}

export interface PageOverrides {
  /** Variables CSS à poser sur le conteneur de la page. */
  variables: Record<string, string>;
  avertissements: string[];
}

/**
 * Surcharges d'une page (`theme_overrides` du front-matter). Seules les
 * couleurs de la palette se surchargent, pas la typographie ni les tailles,
 * pour que toutes les pages gardent la même allure (README §8).
 *
 * Une variable CSS qui renvoie à une autre est résolue là où elle est posée :
 * celles du thème qui renvoient à la palette sont donc reposées avec les
 * surcharges, sur le conteneur de la page, pour y prendre les nouvelles couleurs.
 */
export function variablesDeSurcharge(surcharges: Record<string, unknown>, theme: Theme): PageOverrides {
  const variables: Record<string, string> = {};
  const avertissements: string[] = [];
  for (const [cle, valeur] of Object.entries(surcharges)) {
    if (!(nomsDeCouleur as readonly string[]).includes(cle)) {
      avertissements.push(`theme_overrides.${cle} : seules les couleurs se surchargent (${nomsDeCouleur.join(', ')}).`);
    } else if (!estCouleur(valeur)) {
      avertissements.push(`theme_overrides.${cle} : une couleur comme "#7aa2f7" est attendue.`);
    } else {
      variables[variableDeCouleur[cle as ColorName]] = valeur;
    }
  }
  if (Object.keys(variables).length > 0) {
    for (const [nom, valeur] of Object.entries(variablesDuTheme(theme))) {
      if (valeur.startsWith('var(')) {
        variables[nom] = valeur;
      }
    }
  }
  return { variables, avertissements };
}
