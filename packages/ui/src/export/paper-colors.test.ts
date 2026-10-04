import { describe, expect, it } from 'vitest';
import { themeParDefaut } from '../theme/defaults';
import type { Theme } from '../theme/defaults';
import { contraste, contrasteDesTraits, contrasteDuTexte, couleurLisible, palettePapier, variablesDuPapier } from './paper-colors';

const blanc = '#ffffff';

/** La couleur réelle d'une variable du papier, en suivant les renvois `var(--x)`. */
function resoudre(variables: Record<string, string>, nom: string): string {
  let valeur = variables[nom] as string;
  for (let tour = 0; tour < 5 && valeur.startsWith('var('); tour += 1) {
    valeur = variables[valeur.slice(4, -1)] as string;
  }
  return valeur;
}

describe('contraste', () => {
  it('donne 21 du noir au blanc et 1 d’une couleur à elle-même', () => {
    expect(contraste('#000000', blanc)).toBeCloseTo(21, 5);
    expect(contraste('#60a5fa', '#60a5fa')).toBe(1);
  });
});

describe('couleurLisible', () => {
  it('fonce le jaune des titres jusqu’au contraste demandé, et garde une couleur déjà lisible', () => {
    const jaune = couleurLisible('#facc15', blanc, contrasteDuTexte);
    expect(contraste(jaune, blanc)).toBeGreaterThanOrEqual(contrasteDuTexte);
    expect(contraste(jaune, blanc)).toBeLessThan(contrasteDuTexte + 0.4);
    expect(couleurLisible('#1f2328', blanc, contrasteDuTexte)).toBe('#1f2328');
    expect(couleurLisible('rgb(1 2 3)', blanc, contrasteDuTexte)).toBe('rgb(1 2 3)');
  });
});

describe('variablesDuPapier', () => {
  const textes = ['--color-texte', '--color-discret', '--color-accent', '--color-succes', '--color-alerte', '--color-erreur', '--page-h1-couleur', '--page-h2-couleur', '--page-h3-couleur', '--page-h4-couleur', '--page-h5-couleur'];
  const traits = ['--page-puce-1', '--page-puce-2', '--page-puce-3', '--callout-info', '--callout-succes', '--callout-alerte', '--callout-danger'];

  const verifier = (theme: Theme, surcharges: Record<string, string> = {}): void => {
    const variables = variablesDuPapier(theme, surcharges);
    expect(variables['--color-fond']).toBe(blanc);
    for (const nom of textes) {
      expect(contraste(resoudre(variables, nom), blanc), nom).toBeGreaterThanOrEqual(contrasteDuTexte);
    }
    for (const nom of traits) {
      expect(contraste(resoudre(variables, nom), blanc), nom).toBeGreaterThanOrEqual(contrasteDesTraits);
    }
    // Le texte reste lisible sur les fonds clairs du papier (en-tête de tableau, code en ligne).
    expect(contraste(resoudre(variables, '--color-texte'), palettePapier.surface as string)).toBeGreaterThanOrEqual(contrasteDuTexte);
    expect(contraste(resoudre(variables, '--color-discret'), palettePapier.surface as string)).toBeGreaterThanOrEqual(contrasteDuTexte);
  };

  it('rend lisibles sur le blanc toutes les couleurs du thème par défaut', () => verifier(themeParDefaut));

  it('fait de même pour un thème très clair et pour les couleurs propres à une page', () => {
    const pastel: Theme = {
      ...themeParDefaut,
      colors: { ...themeParDefaut.colors, accent: '#bfe3ff', warning: '#fff3a0' },
      heading: { ...themeParDefaut.heading, h2: { ...themeParDefaut.heading.h2, color: '#e0ffe0' } },
      list: { bullet_1: '#ffeeee', bullet_2: 'accent', bullet_3: '#fafafa' },
    };
    verifier(pastel, { '--color-accent': '#ffe9b0', '--color-texte': '#ffffff' });
  });

  it('garde le fond sombre des blocs de code et le teinte des couleurs du thème', () => {
    const variables = variablesDuPapier(themeParDefaut, {});
    expect(variables['--export-fond-des-blocs-de-code']).toBe(themeParDefaut.colors.surface);
    expect(variables['--page-fond-code']).toBe('var(--color-surface)');
  });
});
