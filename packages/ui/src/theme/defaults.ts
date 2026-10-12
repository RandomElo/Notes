/**
 * Le thème : tout ce qui se règle dans `.notes/theme.toml` (docs/spec/theme.md). Les
 * clés sont celles du fichier TOML, telles quelles, pour qu'on retrouve dans le
 * code ce qu'on lit dans le fichier.
 */

/** Les couleurs de la palette. Les autres couleurs du thème peuvent y renvoyer par leur nom. */
export const nomsDeCouleur = ['background', 'surface', 'border', 'text', 'muted', 'accent', 'success', 'warning', 'error'] as const;
export type ColorName = (typeof nomsDeCouleur)[number];

export const niveauxDeTitre = ['h1', 'h2', 'h3', 'h4', 'h5'] as const;
export type HeadingLevel = (typeof niveauxDeTitre)[number];

export interface HeadingStyle {
  size: string;
  weight: number;
  italic: boolean;
  /** Trait fin sous le titre. */
  underline: boolean;
  /** Couleur (`#rrggbb`) ou nom d'une couleur de la palette. */
  color: string;
  margin_top: string;
}

export interface Theme {
  colors: Record<ColorName, string>;
  typography: { font: string; mono: string; size: string; line_height: number };
  heading: Record<HeadingLevel, HeadingStyle>;
  list: { bullet_1: string; bullet_2: string; bullet_3: string };
  code: {
    background: string;
    font_size: string;
    /** Numéro de chaque ligne dans la marge des blocs de code. */
    line_numbers: boolean;
    /** Les lignes longues passent à la ligne au lieu de faire défiler le bloc. */
    wrap: boolean;
    syntax: {
      text: string;
      comment: string;
      keyword: string;
      control: string;
      string: string;
      regex: string;
      number: string;
      function: string;
      type: string;
      variable: string;
      tag: string;
      attribute: string;
    };
  };
  callout: { info: string; success: string; warning: string; danger: string };
  table: { border: string; header_background: string };
  ui: { content_width: string; sidebar_width: string; radius: string; transition: string };
}

/**
 * Thème par défaut. Les titres ont été choisis par Eloi sur comparatif (gras,
 * trait fin, italique, gras à la taille du texte, italique léger), le titre de
 * la page tenant lieu de niveau 1. Leurs couleurs sont la palette « Feux »,
 * choisie elle aussi sur comparatif : rouge, orange, jaune, vert, gris.
 */
export const themeParDefaut: Theme = {
  colors: {
    background: '#16171b',
    surface: '#1e2026',
    border: '#2d3039',
    text: '#e6e7ea',
    muted: '#9aa0ab',
    accent: '#60a5fa',
    success: '#7bc47f',
    warning: '#e0af68',
    error: '#f08a8a',
  },
  typography: {
    font: "system-ui, -apple-system, 'Segoe UI', sans-serif",
    mono: "ui-monospace, 'JetBrains Mono', 'DejaVu Sans Mono', monospace",
    size: '1rem',
    line_height: 1.65,
  },
  heading: {
    h1: { size: '1.6rem', weight: 700, italic: false, underline: false, color: '#f87171', margin_top: '1.5em' },
    h2: { size: '1.3rem', weight: 700, italic: false, underline: true, color: '#fb923c', margin_top: '1.3em' },
    h3: { size: '1.1rem', weight: 600, italic: true, underline: false, color: '#facc15', margin_top: '1.2em' },
    h4: { size: '1rem', weight: 600, italic: false, underline: false, color: '#4ade80', margin_top: '1.2em' },
    h5: { size: '1rem', weight: 400, italic: true, underline: false, color: 'muted', margin_top: '1.1em' },
  },
  list: { bullet_1: '#f87171', bullet_2: '#fb923c', bullet_3: '#4ade80' },
  code: {
    background: 'surface',
    font_size: '0.875rem',
    line_numbers: false,
    wrap: true,
    // Couleurs du thème « Dark+ » de VS Code, celui qu'utilise Eloi.
    syntax: {
      text: '#d4d4d4',
      comment: '#6a9955',
      keyword: '#569cd6',
      control: '#c586c0',
      string: '#ce9178',
      regex: '#d16969',
      number: '#b5cea8',
      function: '#dcdcaa',
      type: '#4ec9b0',
      variable: '#9cdcfe',
      tag: '#569cd6',
      attribute: '#9cdcfe',
    },
  },
  callout: { info: 'accent', success: 'success', warning: 'warning', danger: 'error' },
  table: { border: 'border', header_background: 'surface' },
  ui: { content_width: '48rem', sidebar_width: '18rem', radius: '0.375rem', transition: '150ms' },
};
