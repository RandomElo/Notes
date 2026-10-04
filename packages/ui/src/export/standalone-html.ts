import baseCss from '../styles/base.css?raw';
import resetCss from '../styles/reset.css?raw';
import exportCss from '../styles/export.css?raw';
import { variablesDuTheme } from '../theme/css-vars';
import type { Theme } from '../theme/defaults';
import { variablesDuPapier } from './paper-colors';

/** Un titre de la page dans le sommaire d'un export. */
export interface ExportOutlineEntry {
  niveau: number;
  texte: string;
  /** Identifiant posé sur le titre dans le contenu. */
  ancre: string;
}

export interface StandaloneHtmlInput {
  titre: string;
  /**
   * HTML de l'icône de la page, ou null. Comme « contenu », il est produit par
   * le rendu de l'application (sérialisation du DOM), jamais repris d'un fichier.
   */
  icone: string | null;
  /** Contenu de la page : intérieur de l'élément `.notes-page` rendu, nettoyé. */
  contenu: string;
  theme: Theme;
  /** Surcharges de couleurs de la page (`variablesDeSurcharge`), posées sur le conteneur. */
  surcharges: Record<string, string>;
  /** Vrai pour le PDF : fond blanc, couleurs du thème foncées au besoin pour rester lisibles (README §9). */
  papier: boolean;
  /** Titres de la page : un sommaire est mis en tête si la page est assez longue (`sommaireUtile`). */
  sommaire: ExportOutlineEntry[];
  /** Navigation entre les pages d'une archive (HTML déjà construit par `navigationDArchive`), ou null. */
  navigation: string | null;
  /**
   * Adresse de la feuille de style commune d'une archive (`feuilleCommune`), relative à la page.
   * Absente : tout est dans la page, qui se suffit à elle-même.
   */
  feuilleDeStyle?: string;
}

/** Échappe un texte pour le poser dans du HTML, contenu ou valeur d'attribut. */
export function echapperHtml(texte: string): string {
  return texte.replace(/[&<>"']/g, (caractere) => `&#${caractere.charCodeAt(0)};`);
}

/** Une déclaration de variable sûre : nom et valeur viennent du thème, revérifiés pour ne pas sortir du bloc CSS. */
function declarations(variables: Record<string, string>): string {
  return Object.entries(variables)
    .filter(([nom, valeur]) => /^--[a-z0-9-]+$/.test(nom) && !/[{}<;]/.test(valeur))
    .map(([nom, valeur]) => `  ${nom}: ${valeur};`)
    .join('\n');
}

/** Ce qui ne dépend pas de la page : variables du thème, remise à zéro, contenu (base.css), mise en page. Seule feuille d'une archive. */
export function feuilleCommune(theme: Theme): string {
  return `:root {\n${declarations(variablesDuTheme(theme))}\n}\n\n${resetCss}\n${baseCss}\n${exportCss}`;
}

/** Ce qui est propre à la page : ses couleurs, et le papier du PDF. */
function feuilleDeLaPage(theme: Theme, surcharges: Record<string, string>, papier: boolean): string {
  const variables = papier ? variablesDuPapier(theme, surcharges) : surcharges;
  // `:root` et non `html` : le bloc commun pose ses variables sur `:root`, plus fort que `html`. Avec `html`, la racine
  // restait sombre sous le papier blanc : un liseré autour de chaque page, et un grand rectangle sous la fin du contenu.
  const page = Object.keys(variables).length === 0 ? '' : `:root, body, .export-navigation {\n${declarations(variables)}\n}\n`;
  return papier ? `${page}.notes-page pre {\n  background-color: var(--export-fond-des-blocs-de-code);\n}\n` : page;
}

/** Les feuilles de style d'un export en un seul texte : variables du thème, contenu, mise en page, page. */
export function feuilleDExport(theme: Theme, surcharges: Record<string, string>, papier: boolean): string {
  return `${feuilleCommune(theme)}\n${feuilleDeLaPage(theme, surcharges, papier)}`;
}

/** Niveau le plus bas repris dans le sommaire : `#`, `##` et `###` (h1 à h3 du contenu), choix d'Eloi. */
const niveauMaxDuSommaire = 3;

/** Nombre de titres à partir duquel une page a un sommaire, et nombre de sous-parties qu'il faut parmi eux. */
const titresPourUnSommaire = 6;
const sousPartiesPourUnSommaire = 3;

/**
 * Vrai pour une page assez longue pour qu'un sommaire serve (choix d'Eloi) :
 * au moins six titres de niveau 1 à 3, dont trois sous-parties (titres sous le niveau le plus haut).
 */
export function sommaireUtile(tousLesTitres: readonly ExportOutlineEntry[]): boolean {
  const sommaire = titresDuSommaire(tousLesTitres);
  if (sommaire.length < titresPourUnSommaire) {
    return false;
  }
  const plusHaut = Math.min(...sommaire.map((entree) => entree.niveau));
  return sommaire.filter((entree) => entree.niveau > plusHaut).length >= sousPartiesPourUnSommaire;
}

/** Les titres repris dans le sommaire : jusqu'au niveau 3. */
function titresDuSommaire(sommaire: readonly ExportOutlineEntry[]): ExportOutlineEntry[] {
  return sommaire.filter((entree) => entree.niveau <= niveauMaxDuSommaire);
}

/** Le sommaire, avec des liens vers les titres. Repliable dans une page web, simple liste sur le papier. */
function sommaireHtml(tousLesTitres: ExportOutlineEntry[], papier: boolean): string {
  if (!sommaireUtile(tousLesTitres)) {
    return '';
  }
  const sommaire = titresDuSommaire(tousLesTitres);
  const plusHaut = Math.min(...sommaire.map((entree) => entree.niveau));
  const lignes = sommaire
    .map((entree) => `<li data-niveau="${entree.niveau - plusHaut + 1}"><a href="#${encodeURIComponent(entree.ancre)}">${echapperHtml(entree.texte)}</a></li>`)
    .join('');
  return papier
    ? `<nav class="export-sommaire" aria-label="Sommaire"><p class="export-sommaire-titre">Sommaire</p><ol>${lignes}</ol></nav>`
    : `<details class="export-sommaire" open><summary>Sommaire</summary><ol>${lignes}</ol></details>`;
}

/**
 * Le document HTML d'une page exportée (README §9), sans aucun script. Seul, il
 * contient ses styles et ses images, et sa politique de sécurité interdit tout
 * chargement hors des images `data:`. Dans une archive, il renvoie à la feuille
 * de style et aux images de l'archive, et ne charge rien d'autre.
 */
export function documentHtmlAutonome(entree: StandaloneHtmlInput): string {
  const titre = echapperHtml(entree.titre);
  const icone = entree.icone === null ? '' : `<span class="export-icone">${entree.icone}</span>`;
  const archive = entree.feuilleDeStyle !== undefined;
  const politique = archive
    ? "default-src 'none'; img-src 'self' data: file:; style-src 'self' 'unsafe-inline' file:"
    : "default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'";
  const styles = archive
    ? `<link rel="stylesheet" href="${echapperHtml(entree.feuilleDeStyle as string)}">\n<style>\n${feuilleDeLaPage(entree.theme, entree.surcharges, entree.papier)}</style>`
    : `<style>\n${feuilleDExport(entree.theme, entree.surcharges, entree.papier)}</style>`;
  return [
    '<!doctype html>',
    '<html lang="fr">',
    '<head>',
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${politique}">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${titre}</title>`,
    styles,
    '</head>',
    '<body>',
    entree.navigation ?? '',
    `<main class="export"><header class="export-entete">${icone}<h1 class="export-titre">${titre}</h1></header>${sommaireHtml(entree.sommaire, entree.papier)}<div class="notes-page">${entree.contenu}</div></main>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

/** Une page dans la navigation d'une archive. */
export interface ArchiveNavigationEntry {
  titre: string;
  /** Adresse relative depuis la page qui affiche la navigation, ou null pour une page laissée hors de l'archive. */
  adresse: string | null;
  courante: boolean;
  enfants: ArchiveNavigationEntry[];
}

/** La navigation entre les pages d'une archive, en tête de chaque page HTML. */
export function navigationDArchive(pages: ArchiveNavigationEntry[]): string {
  const element = (page: ArchiveNavigationEntry): string =>
    page.adresse === null
      ? `<span class="export-navigation-absente">${echapperHtml(page.titre)}</span>`
      : `<a href="${echapperHtml(page.adresse)}"${page.courante ? ' aria-current="page"' : ''}>${echapperHtml(page.titre)}</a>`;
  const liste = (entrees: ArchiveNavigationEntry[]): string =>
    `<ul>${entrees.map((page) => `<li>${element(page)}${page.enfants.length > 0 ? liste(page.enfants) : ''}</li>`).join('')}</ul>`;
  return `<nav class="export-navigation" aria-label="Pages de l'archive">${liste(pages)}</nav>`;
}
