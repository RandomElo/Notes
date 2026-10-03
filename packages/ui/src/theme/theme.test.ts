import { describe, expect, it } from 'vitest';
import { variablesDeSurcharge, variablesDuTheme } from './css-vars';
import { themeParDefaut } from './defaults';
import { lireTheme } from './parse';
import { texteDuTheme, texteDuThemeParDefaut, verifierTheme } from './template';

const feuilles = import.meta.glob('../styles/*.css', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const feuille = (nom: string): string => {
  const texte = feuilles[`../styles/${nom}`];
  if (texte === undefined) {
    throw new Error(`${nom} introuvable`);
  }
  return texte;
};

describe('lireTheme', () => {
  it('rend le thème par défaut sans fichier ou avec un fichier vide', () => {
    expect(lireTheme(null)).toEqual({ theme: themeParDefaut, avertissements: [] });
    expect(lireTheme('  \n# rien\n')).toEqual({ theme: themeParDefaut, avertissements: [] });
  });

  it('ne change que ce que le fichier règle', () => {
    const { theme, avertissements } = lireTheme('[colors]\naccent = "#ff0000"\n\n[heading.h2]\nsize = "2rem"\nunderline = false\ncolor = "accent"\n\n[typography]\nline_height = 1.8\n');
    expect(avertissements).toEqual([]);
    expect(theme.colors.accent).toBe('#ff0000');
    expect(theme.colors.text).toBe(themeParDefaut.colors.text);
    expect(theme.heading.h2).toEqual({ ...themeParDefaut.heading.h2, size: '2rem', underline: false, color: 'accent' });
    expect(theme.heading.h1).toEqual(themeParDefaut.heading.h1);
    expect(theme.typography.line_height).toBe(1.8);
  });

  it('ne modifie jamais le thème par défaut lui-même', () => {
    lireTheme('[colors]\naccent = "#ff0000"\n');
    expect(themeParDefaut.colors.accent).toBe('#60a5fa');
  });

  it('ignore une valeur fausse, garde le défaut et dit ce qui était attendu', () => {
    const { theme, avertissements } = lireTheme(
      '[colors]\naccent = "rouge"\ntext = "#fff"\n\n[heading.h1]\nsize = "grand"\nweight = 750\nitalic = "oui"\n\n[typography]\nline_height = 12\n\n[ui]\ntransition = "vite"\n',
    );
    expect(theme.colors.accent).toBe(themeParDefaut.colors.accent);
    expect(theme.colors.text).toBe('#fff');
    expect(theme.heading.h1).toEqual(themeParDefaut.heading.h1);
    expect(avertissements).toHaveLength(6);
    expect(avertissements[0]).toBe('colors.accent : "rouge" n\'est pas une couleur comme "#7aa2f7". La valeur par défaut est gardée.');
    expect(avertissements[1]).toContain('heading.h1.size : "grand"');
    expect(avertissements[2]).toContain('heading.h1.weight : 750');
    expect(avertissements[3]).toContain('true ou false');
  });

  it('signale les réglages inconnus sans rien casser', () => {
    const { theme, avertissements } = lireTheme('couleur = "#fff"\n\n[colors]\nacent = "#ff0000"\n\n[heading.h9]\nsize = "1rem"\n\n[heading]\nh1 = "gros"\n');
    expect(theme).toEqual(themeParDefaut);
    expect(avertissements).toEqual([
      'couleur : réglage inconnu, ignoré.',
      'colors.acent : réglage inconnu, ignoré.',
      'heading.h9 : réglage inconnu, ignoré.',
      "heading.h1 est une section : elle s'écrit [heading.h1], suivie de ses réglages.",
    ]);
  });

  it('rend le thème par défaut pour un fichier illisible, avec la ligne fautive', () => {
    const { theme, avertissements } = lireTheme('[colors]\naccent = "#ff0000"\ntext = \n');
    expect(theme).toEqual(themeParDefaut);
    expect(avertissements).toEqual(["Le fichier n'est pas lisible (ligne 3). Le thème par défaut est utilisé."]);
  });

  it('refuse tout ce qui n’a pas la forme attendue : rien d’autre ne passe dans une variable CSS', () => {
    const tentatives = [
      '[colors]\naccent = "red; background: url(http://exemple.test)"',
      '[colors]\naccent = "url(http://exemple.test)"',
      '[typography]\nfont = "x; } body { display: none"',
      '[typography]\nsize = "calc(1rem + 100vw)"',
      '[ui]\ncontent_width = "48rem; color: red"',
      '[heading.h1]\ncolor = "var(--autre)"',
    ];
    for (const texte of tentatives) {
      const { theme, avertissements } = lireTheme(texte);
      expect(theme).toEqual(themeParDefaut);
      expect(avertissements).toHaveLength(1);
    }
  });

  it('ne se laisse pas noyer par un fichier très faux', () => {
    const texte = Array.from({ length: 40 }, (_valeur, index) => `inconnu_${index} = 1`).join('\n');
    const { avertissements } = lireTheme(texte);
    expect(avertissements).toHaveLength(13);
    expect(avertissements.at(-1)).toBe('Et 28 autres.');
  });
});

describe('texteDuThemeParDefaut', () => {
  it('se relit sans avertissement et donne le thème par défaut', () => {
    const texte = texteDuThemeParDefaut();
    expect(lireTheme(texte)).toEqual({ theme: themeParDefaut, avertissements: [] });
    expect(texte).toContain('[heading.h2]\nsize = "1.3rem"\nweight = 700\nitalic = false\nunderline = true\ncolor = "#fb923c"\nmargin_top = "1.3em"\n');
    expect(texte).toContain('[code.syntax]');
    // Le commentaire des titres n'est écrit qu'une fois.
    expect(texte.match(/# Titres\./g)).toHaveLength(1);
  });
});

describe('texteDuTheme et verifierTheme', () => {
  it('écrit un thème modifié qui se relit à l’identique', () => {
    const theme = structuredClone(themeParDefaut);
    theme.colors.accent = '#ff8800';
    theme.heading.h3.italic = false;
    theme.typography.line_height = 1.8;
    theme.typography.font = "Inter, 'Noto Sans', sans-serif";
    expect(lireTheme(texteDuTheme(theme))).toEqual({ theme, avertissements: [] });
  });

  it('accepte un thème bien formé et le rend sans rien de plus', () => {
    const recu = { ...structuredClone(themeParDefaut), intrus: 'x' };
    expect(verifierTheme(recu)).toEqual(themeParDefaut);
  });

  it('refuse un thème dont une seule valeur ne convient pas, ou qui n’en est pas un', () => {
    const faux = structuredClone(themeParDefaut);
    faux.colors.accent = 'red; x';
    expect(verifierTheme(faux)).toBeNull();
    expect(verifierTheme(null)).toBeNull();
    expect(verifierTheme('theme')).toBeNull();
    expect(verifierTheme({ colors: {} })).toBeNull();
  });
});

describe('variablesDuTheme', () => {
  const variables = variablesDuTheme(themeParDefaut);

  it('renvoie aux couleurs de la palette par leur variable, pour que les surcharges de page suivent', () => {
    expect(variables['--color-accent']).toBe('#60a5fa');
    expect(variables['--page-h1-couleur']).toBe('#f87171');
    expect(variables['--page-h5-couleur']).toBe('var(--color-discret)');
    expect(variables['--code-fonction']).toBe('#dcdcaa');
    expect(variables['--page-fond-code']).toBe('var(--color-surface)');
    expect(variables['--page-puce-2']).toBe('#fb923c');
    expect(variables['--page-h2-trait']).toBe('underline');
    expect(variables['--page-h3-style']).toBe('italic');
  });

  it('fournit toutes les variables de thème dont les feuilles de style se servent', () => {
    const utilisees = new Set([...feuille('base.css').matchAll(/var\((--[a-z0-9-]+)/g)].map((trouve) => trouve[1] as string));
    // Variables que base.css définit elle-même, à partir de celles du thème.
    const locales = new Set([...feuille('base.css').matchAll(/^\s*(--[a-z0-9-]+):/gm)].map((trouve) => trouve[1] as string));
    const manquantes = [...utilisees].filter((nom) => !locales.has(nom) && variables[nom] === undefined);
    expect(manquantes).toEqual([]);
  });

  it('donne par défaut les mêmes couleurs que les jetons Tailwind de theme.css', () => {
    const jetons = Object.fromEntries([...feuille('theme.css').matchAll(/^\s*(--[a-z-]+):\s*([^;]+);/gm)].map((trouve) => [trouve[1], trouve[2]]));
    for (const [nom, valeur] of Object.entries(jetons)) {
      expect(variables[nom as string], nom as string).toBe(valeur);
    }
  });
});

describe('variablesDeSurcharge', () => {
  it('ne laisse passer que des couleurs de la palette', () => {
    const prises = variablesDeSurcharge({ accent: '#ff8800', background: '#000' }, themeParDefaut);
    expect(prises.avertissements).toEqual([]);
    expect(prises.variables).toMatchObject({ '--color-accent': '#ff8800', '--color-fond': '#000' });
    // Ce qui renvoie à la palette est reposé au même endroit, pour suivre la nouvelle couleur. Le reste n'y est pas.
    expect(prises.variables['--page-fond-code']).toBe('var(--color-surface)');
    expect(prises.variables['--code-fonction']).toBeUndefined();
    expect(prises.variables['--page-h5-couleur']).toBe('var(--color-discret)');
    expect(prises.variables['--page-puce-1']).toBeUndefined();
    expect(prises.variables['--page-h1-taille']).toBeUndefined();
    expect(prises.variables['--color-texte']).toBeUndefined();
    const { variables, avertissements } = variablesDeSurcharge({ accent: 'red', size: '2rem', text: { a: 1 } }, themeParDefaut);
    expect(variables).toEqual({});
    expect(avertissements).toHaveLength(3);
    expect(avertissements[1]).toContain('seules les couleurs se surchargent');
  });
});
