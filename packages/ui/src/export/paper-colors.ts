import { variableDeCouleur, variablesDuTheme } from '../theme/css-vars';
import { niveauxDeTitre, nomsDeCouleur } from '../theme/defaults';
import type { ColorName, Theme } from '../theme/defaults';

/** Contraste minimal d'un texte sur le papier (WCAG AA, texte courant). */
export const contrasteDuTexte = 4.5;
/** Contraste minimal d'un élément graphique (puce, barre d'un callout). */
export const contrasteDesTraits = 3;

/** Couleurs neutres du papier : fond blanc, texte sombre. */
export const palettePapier: Partial<Record<ColorName, string>> = {
  background: '#ffffff',
  surface: '#f2f3f5',
  border: '#d4d7dd',
  text: '#1f2328',
  muted: '#5c636e',
};

function versRvb(hex: string): [number, number, number] | null {
  const trouve = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (trouve === null) {
    return null;
  }
  const chiffres = (trouve[1] as string).length === 3 ? [...(trouve[1] as string)].map((c) => c + c).join('') : (trouve[1] as string);
  return [0, 2, 4].map((debut) => parseInt(chiffres.slice(debut, debut + 2), 16)) as [number, number, number];
}

function versHex([r, v, b]: [number, number, number]): string {
  return `#${[r, v, b].map((composante) => Math.round(Math.min(255, Math.max(0, composante))).toString(16).padStart(2, '0')).join('')}`;
}

/** Luminance relative d'une couleur (WCAG 2). */
export function luminance(hex: string): number {
  const rvb = versRvb(hex);
  if (rvb === null) {
    return 0;
  }
  const [r, v, b] = rvb.map((composante) => {
    const c = composante / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * v + 0.0722 * b;
}

/** Rapport de contraste entre deux couleurs, de 1 à 21. */
export function contraste(a: string, b: string): number {
  const [claire, sombre] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (claire + 0.05) / (sombre + 0.05);
}

/** RVB vers TSL (teinte en degrés, saturation et luminosité de 0 à 1), et retour. */
function versTsl([r, v, b]: [number, number, number]): [number, number, number] {
  const [rr, vv, bb] = [r / 255, v / 255, b / 255];
  const max = Math.max(rr, vv, bb);
  const min = Math.min(rr, vv, bb);
  const l = (max + min) / 2;
  if (max === min) {
    return [0, 0, l];
  }
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const t = max === rr ? (vv - bb) / d + (vv < bb ? 6 : 0) : max === vv ? (bb - rr) / d + 2 : (rr - vv) / d + 4;
  return [t * 60, s, l];
}

function depuisTsl([t, s, l]: [number, number, number]): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((t / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, v, b] = t < 60 ? [c, x, 0] : t < 120 ? [x, c, 0] : t < 180 ? [0, c, x] : t < 240 ? [0, x, c] : t < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (v + m) * 255, (b + m) * 255];
}

/**
 * La même couleur, assez foncée pour se lire sur le fond : la teinte et la
 * saturation sont gardées, seule la luminosité baisse, par petits pas, jusqu'au
 * contraste demandé. Une couleur qui se lit déjà reste telle quelle ; une
 * valeur qui n'est pas une couleur `#rrggbb` aussi.
 */
export function couleurLisible(hex: string, fond: string, minimum: number): string {
  const rvb = versRvb(hex);
  if (rvb === null || contraste(hex, fond) >= minimum) {
    return hex;
  }
  const [t, s, l] = versTsl(rvb);
  for (let luminosite = l; luminosite > 0; luminosite -= 0.01) {
    const candidate = versHex(depuisTsl([t, s, luminosite]));
    if (contraste(candidate, fond) >= minimum) {
      return candidate;
    }
  }
  return '#000000';
}

/** Valeur effective d'une couleur de la palette : la surcharge de la page, sinon le thème. */
function valeurDeLaPalette(nom: ColorName, theme: Theme, surcharges: Record<string, string>): string {
  return surcharges[variableDeCouleur[nom]] ?? theme.colors[nom];
}

const estDeLaPalette = (valeur: string): valeur is ColorName => (nomsDeCouleur as readonly string[]).includes(valeur);

/**
 * Les variables du papier (docs/spec/export.md) : fond blanc et texte sombre, et toutes
 * les couleurs du thème qui s'affichent sur ce fond (titres, accent, natures
 * des callouts, puces) foncées juste assez pour être lisibles : 4,5:1 pour
 * le texte, 3:1 pour les traits. Les blocs de code gardent leur fond sombre
 * (posé à part), avec leurs couleurs.
 */
export function variablesDuPapier(theme: Theme, surcharges: Record<string, string>): Record<string, string> {
  const fond = palettePapier.background as string;
  const variables: Record<string, string> = {};
  for (const nom of nomsDeCouleur) {
    variables[variableDeCouleur[nom]] = palettePapier[nom] ?? couleurLisible(valeurDeLaPalette(nom, theme, surcharges), fond, contrasteDuTexte);
  }
  // Une couleur du thème qui renvoie à la palette suit la palette du papier ; une couleur écrite en dur est foncée au besoin.
  const adapter = (valeur: string, minimum: number): string => (estDeLaPalette(valeur) ? `var(${variableDeCouleur[valeur]})` : couleurLisible(valeur, fond, minimum));
  for (const niveau of niveauxDeTitre) {
    variables[`--page-${niveau}-couleur`] = adapter(theme.heading[niveau].color, contrasteDuTexte);
  }
  variables['--page-puce-1'] = adapter(theme.list.bullet_1, contrasteDesTraits);
  variables['--page-puce-2'] = adapter(theme.list.bullet_2, contrasteDesTraits);
  variables['--page-puce-3'] = adapter(theme.list.bullet_3, contrasteDesTraits);
  variables['--callout-info'] = adapter(theme.callout.info, contrasteDesTraits);
  variables['--callout-succes'] = adapter(theme.callout.success, contrasteDesTraits);
  variables['--callout-alerte'] = adapter(theme.callout.warning, contrasteDesTraits);
  variables['--callout-danger'] = adapter(theme.callout.danger, contrasteDesTraits);
  // Tableaux : bordure et en-tête du papier, quelle que soit la couleur sombre choisie pour l'écran.
  variables['--tableau-bordure'] = 'var(--color-bordure)';
  variables['--tableau-entete'] = 'var(--color-surface)';
  // Code en ligne sur fond clair ; les blocs de code gardent le fond sombre du thème, pour ses couleurs.
  variables['--page-fond-code'] = 'var(--color-surface)';
  const fondDuCode = theme.code.background;
  variables['--export-fond-des-blocs-de-code'] = estDeLaPalette(fondDuCode) ? valeurDeLaPalette(fondDuCode, theme, surcharges) : fondDuCode;
  // Ce qui renvoie encore à la palette (h5 en gris, par exemple) est reposé ici, pour y prendre les couleurs du papier.
  for (const [nom, valeur] of Object.entries(variablesDuTheme(theme))) {
    if (valeur.startsWith('var(') && variables[nom] === undefined) {
      variables[nom] = valeur;
    }
  }
  return variables;
}
