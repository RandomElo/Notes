import { describe, expect, it } from 'vitest';
import { themeParDefaut } from '../theme/defaults';
import { documentHtmlAutonome, echapperHtml, feuilleCommune, feuilleDExport, navigationDArchive, sommaireUtile } from './standalone-html';

const entree = {
  titre: 'Réseau <maison> & "NAS"',
  icone: null,
  contenu: '<p>Texte</p>',
  theme: themeParDefaut,
  surcharges: {},
  papier: false,
  sommaire: [],
  navigation: null,
};

describe('documentHtmlAutonome', () => {
  it('échappe le titre et ne charge rien de l’extérieur', () => {
    const html = documentHtmlAutonome(entree);
    expect(html).toContain('<title>Réseau &#60;maison&#62; &#38; &#34;NAS&#34;</title>');
    expect(html).not.toContain('<maison>');
    expect(html).toContain("default-src 'none'; img-src data:");
    expect(html).not.toMatch(/<script|<link|https?:\/\//);
  });

  it('embarque les styles du contenu et les variables du thème', () => {
    const html = documentHtmlAutonome(entree);
    expect(html).toContain('.notes-page h2');
    // Remise à zéro de l'application (preflight) avant les styles du contenu.
    expect(html.indexOf('box-sizing: border-box;')).toBeLessThan(html.indexOf('.notes-page h2'));
    expect(html).toContain('--color-texte: #e6e7ea;');
    expect(html).toContain('<div class="notes-page"><p>Texte</p></div>');
  });

  it('met un sommaire avec ses ancres à une page longue, avec des sous-parties', () => {
    const sommaire = [
      { niveau: 2, texte: 'Un & deux', ancre: 'un-deux' },
      { niveau: 3, texte: 'Trois', ancre: 'trois' },
      { niveau: 3, texte: 'Quatre', ancre: 'quatre' },
      { niveau: 2, texte: 'Cinq', ancre: 'cinq' },
      { niveau: 3, texte: 'Six', ancre: 'six' },
      { niveau: 3, texte: 'Sept', ancre: 'sept' },
    ];
    const html = documentHtmlAutonome({ ...entree, sommaire });
    expect(html).toContain('<details class="export-sommaire" open>');
    expect(html).toContain('<li data-niveau="1"><a href="#un-deux">Un &#38; deux</a></li><li data-niveau="2"><a href="#trois">Trois</a></li>');
    // Sur le papier, une liste simple.
    expect(documentHtmlAutonome({ ...entree, sommaire, papier: true })).toContain('<nav class="export-sommaire" aria-label="Sommaire">');
    expect(documentHtmlAutonome({ ...entree, sommaire: sommaire.slice(0, 5) })).not.toContain('export-sommaire"');
  });

  it('met l’icône sur la ligne du titre', () => {
    expect(documentHtmlAutonome({ ...entree, icone: '<span class="mention-emoji">🧪</span>' })).toContain(
      '<header class="export-entete"><span class="export-icone"><span class="mention-emoji">🧪</span></span><h1 class="export-titre">',
    );
  });

  it('dans une archive, renvoie à la feuille commune et ne garde que les couleurs de la page', () => {
    const html = documentHtmlAutonome({ ...entree, feuilleDeStyle: '../assets/html/style.css', surcharges: { '--color-accent': '#ff8800' } });
    expect(html).toContain('<link rel="stylesheet" href="../assets/html/style.css">');
    expect(html).toContain('--color-accent: #ff8800;');
    expect(html).not.toContain('.notes-page h2');
    expect(feuilleCommune(themeParDefaut)).toContain('.notes-page h2');
  });
});

describe('feuilleDExport', () => {
  it('passe le papier en blanc, garde les couleurs des titres et le fond sombre des blocs de code', () => {
    const css = feuilleDExport(themeParDefaut, {}, true);
    expect(css).toContain('--color-fond: #ffffff;');
    expect(css).toContain('--color-texte: #1f2328;');
    // Le jaune des titres de niveau 3, illisible sur du blanc, est foncé pour le papier.
    const papier = css.slice(css.lastIndexOf(':root, body, .export-navigation {'));
    expect(papier).toMatch(/--page-h3-couleur: #[0-9a-f]{6};/);
    expect(papier).not.toContain(`--page-h3-couleur: ${themeParDefaut.heading.h3.color};`);
    expect(css).toContain(`--export-fond-des-blocs-de-code: ${themeParDefaut.colors.surface};`);
    expect(css).toMatch(/@media print[\s\S]*break-after: avoid/);
  });

  it('pose le papier sur la racine, plus fort que les variables communes', () => {
    const css = feuilleDExport(themeParDefaut, {}, true);
    expect(css.lastIndexOf(':root, body, .export-navigation {')).toBeGreaterThan(css.indexOf(':root {'));
  });

  it('écarte une valeur qui sortirait du bloc CSS', () => {
    const css = feuilleDExport(themeParDefaut, { '--color-accent': 'red; } </style><script>' }, false);
    expect(css).not.toContain('</style>');
  });
});

describe('navigationDArchive', () => {
  it('liste les pages avec la page courante marquée', () => {
    const nav = navigationDArchive([
      { titre: 'A & B', adresse: '../A.html', courante: true, enfants: [{ titre: 'C', adresse: 'C.html', courante: false, enfants: [] }, { titre: 'D', adresse: null, courante: false, enfants: [] }] },
    ]);
    expect(nav).toContain('<a href="../A.html" aria-current="page">A &#38; B</a><ul><li><a href="C.html">C</a></li><li><span class="export-navigation-absente">D</span></li></ul>');
  });
});

describe('sommaireUtile', () => {
  const titre = (niveau: number) => ({ niveau, texte: 't', ancre: 't' });
  it('ne compte et ne montre que les titres de niveau 1 à 3', () => {
    expect(sommaireUtile([1, 2, 4, 4, 4, 5, 5].map(titre))).toBe(false);
    const html = documentHtmlAutonome({ ...entree, sommaire: [1, 2, 2, 3, 1, 4, 2].map((niveau, index) => ({ niveau, texte: `T${index}`, ancre: `t${index}` })) });
    expect(html).toContain('href="#t3"');
    expect(html).not.toContain('href="#t5"');
  });

  it('demande au moins six titres dont trois sous-parties', () => {
    expect(sommaireUtile([1, 2, 2, 2, 1, 1].map(titre))).toBe(true);
    expect(sommaireUtile([1, 1, 1, 1, 1, 1, 1, 2, 2].map(titre))).toBe(false);
    expect(sommaireUtile([1, 2, 2, 2, 2].map(titre))).toBe(false);
  });
});

describe('echapperHtml', () => {
  it('échappe les cinq caractères spéciaux', () => {
    expect(echapperHtml(`<a href="x">'&'</a>`)).toBe('&#60;a href=&#34;x&#34;&#62;&#39;&#38;&#39;&#60;/a&#62;');
  });
});
