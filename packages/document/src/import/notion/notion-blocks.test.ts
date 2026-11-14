import { describe, expect, it } from 'vitest';
import { lireMarkdown } from '../../markdown/parse';
import { ecrireMarkdown } from '../../markdown/serialize';
import { convertirPageNotion } from './notion-blocks';
import type { NotionDatabaseChoice, NotionResolver } from './notion-blocks';
import { analyserPageNotion } from './notion-page';

// Pages écrites comme celles de l'export HTML de Notion : un `article`, son en-tête, son `page-body`.
const page = (corps: string, entete = ''): string =>
  `<html><head><style>body{}</style></head><body><article id="1" class="page sans"><header>${entete}<h1 class="page-title">Ma page</h1></header><div class="page-body">${corps}</div></article></body></html>`;

const resolveur = (bases: NotionDatabaseChoice[] = []): NotionResolver => ({
  page: (adresse) =>
    adresse.includes('Enfant')
      ? { id: '01a12ec7-ce85-7353-95f9-bed4d2e45c18', titre: 'Enfant', sousPage: true }
      : adresse.includes('Sous%20page') || adresse.endsWith('0123456789abcdef0123456789abcdef')
        ? { id: '01a12ec7-ce85-7353-95f9-bed4d2e45c19', titre: 'Sous page' }
        : null,
  image: (adresse) => (adresse.endsWith('chat.png') ? 'assets/chat.png' : null),
  fichier: (adresse) => (adresse.endsWith('cours.pdf') ? 'assets/cours.pdf' : null),
  csv: (adresse) => (adresse.endsWith('.csv') ? [['Nom', 'Statut'], ['Sous page', 'Lu'], ['Inconnue', 'Deux\nlignes']] : null),
  ligne: (_adresse, titre) => (titre === 'Sous page' ? { id: '01a12ec7-ce85-7353-95f9-bed4d2e45c19', titre } : null),
  base: (rang) => bases[rang] ?? 'tableau-et-pages',
});

const corpsDe = (corps: string, bases?: NotionDatabaseChoice[]): string => convertirPageNotion(page(corps), resolveur(bases)).corps;

const base =
  '<div id="1" class="collection-content"><h4 class="collection-title">Lectures</h4><table class="collection-content"><thead><tr><th><span class="icon property-icon"><svg></svg></span>Nom</th><th>Statut</th></tr></thead><tbody><tr id="2"><td class="cell-title"><a href="Ma%20page/Sous%20page%200123.html">Sous page</a></td><td class="cell-x"><span class="selected-value">Lu</span></td></tr></tbody></table></div>';

describe('convertirPageNotion', () => {
  it('reprend titres, paragraphes, mise en forme et liens', () => {
    expect(
      corpsDe(
        '<h1 id="a">Partie</h1><p id="b">Du <strong>gras</strong>, de l’<em>italique</em>, <code>code</code>, <span style="border-bottom:0.05em solid">souligné</span>, <mark class="highlight-yellow_background">surligné</mark> et <a href="https://exemple.fr">un lien</a>.</p><p id="c"></p><h3>Détail</h3>',
      ),
    ).toBe('# Partie\n\nDu **gras**, de l’*italique*, `code`, <u>souligné</u>, ==surligné== et [un lien](https://exemple.fr).\n\n### Détail\n');
  });

  it('réunit les listes que Notion écrit item par item, avec leurs sous-listes', () => {
    expect(
      corpsDe(
        '<ul id="1" class="bulleted-list"><li style="list-style-type:disc">un<ul id="2" class="bulleted-list"><li style="list-style-type:circle">sous</li></ul></li></ul><ul id="3" class="bulleted-list"><li style="list-style-type:disc">deux</li></ul><ol type="1" id="4" class="numbered-list" start="1"><li>premier</li></ol><ol type="1" id="5" class="numbered-list" start="2"><li>second</li></ol>',
      ),
    ).toBe('- un\n  - sous\n- deux\n\n1. premier\n2. second\n');
  });

  it('sort de la liste le contenu d’un item sans texte, et reprend les équations en LaTeX', () => {
    expect(
      corpsDe(
        '<ol class="numbered-list" start="1"><li><ol class="numbered-list" start="1"><li>U1</li></ol></li></ol><ol class="numbered-list" start="2"><li><h2>Titre</h2><p>texte</p></li></ol><ol class="numbered-list" start="3"><li>Suite</li></ol><p>A <span data-notion-inline-equation="\\cap" class="notion-text-equation-token"><span class="katex"><span class="katex-html">∩</span></span></span> B</p>',
      ),
    ).toBe('1. U1\n\n## Titre\n\ntexte\n\n3. Suite\n\nA `\\cap` B\n');
  });

  it('reprend les cases à cocher et leurs sous-tâches', () => {
    expect(
      corpsDe(
        '<ul id="1" class="to-do-list"><li><div class="checkbox checkbox-on"></div> <span class="to-do-children-checked">fait</span><div class="indented"><ul id="2" class="to-do-list"><li><div class="checkbox checkbox-off"></div> <span class="to-do-children-unchecked">à faire</span></li></ul></div></li></ul>',
      ),
    ).toBe('- [x] fait\n  - [ ] à faire\n');
  });

  it('fait d’un bloc dépliable une puce et d’un titre dépliable un titre', () => {
    expect(
      corpsDe(
        '<ul id="1" class="toggle"><li><details open=""><summary>Plier</summary><p id="2">caché</p></details></li></ul><details open=""><summary style="font-weight:600"><h2 id="3">Section</h2></summary><p id="4">dedans</p></details>',
      ),
    ).toBe('- Plier\n\n  caché\n\n## Section\n\ndedans\n');
  });

  it('reprend un callout avec son icône et sa couleur, une citation, un séparateur, du code', () => {
    expect(
      corpsDe(
        '<figure class="block-color-red_background callout" style="white-space:pre-wrap;display:flex" id="1"><div style="font-size:1.5em"><span class="icon">🔥</span></div><div style="width:100%">Attention<br/>deux lignes</div></figure><blockquote id="2">Cité</blockquote><hr id="3"/><pre id="4" class="code"><code class="language-Plain Text">brut</code></pre><pre id="5" class="code"><code class="language-JavaScript">let a = 1;\nlet b = 2;</code></pre>',
      ),
    ).toBe('```notes-callout\ntype: danger\nicon: 🔥\ntext: |-\n  Attention\n\n  deux lignes\n```\n\n> Cité\n\n---\n\n```\nbrut\n```\n\n```javascript\nlet a = 1;\nlet b = 2;\n```\n');
  });

  it('copie les images, et garde le lien des autres', () => {
    expect(
      corpsDe(
        '<figure id="1" class="image"><a href="Ma%20page/chat.png"><img style="width:240px" src="Ma%20page/chat.png"/></a><figcaption>Un chat</figcaption></figure><figure id="2" class="image"><a href="https://exemple.fr/a.png"><img src="https://exemple.fr/a.png"/></a></figure>',
      ),
    ).toBe('![Un chat](assets/chat.png)\n\n[https://exemple.fr/a.png](https://exemple.fr/a.png)\n');
  });

  it('fait des liens vers les pages importées des mentions, par fichier ou par adresse notion.so', () => {
    expect(
      corpsDe(
        '<figure class="link-to-page"><a href="Ma%20page/Enfant%200123.html">Enfant</a></figure><figure class="link-to-page"><a href="Ma%20page/Decochee%200123.html">Décochée</a></figure><figure id="1" class="link-to-page"><a href="Ma%20page/Sous%20page%200123.html"><span class="icon">📄</span>Sous page</a></figure><p>Voir <a href="https://www.notion.so/Sous-page-0123456789abcdef0123456789abcdef">Sous page</a> et <a href="Autre%20page.html">Autre</a>.</p>',
      ),
    ).toBe('[Sous page](notes://01a12ec7-ce85-7353-95f9-bed4d2e45c19)\n\nVoir [Sous page](notes://01a12ec7-ce85-7353-95f9-bed4d2e45c19) et Autre.\n');
  });

  it('copie les PDF joints, en bloc ou en lien, et laisse le nom des autres fichiers', () => {
    const converti = convertirPageNotion(
      page(
        '<figure id="1"><div class="source"><a href="Ma%20page/cours.pdf">cours.pdf</a></div></figure><p>Lire <a href="Ma%20page/cours.pdf">le cours</a>.</p><figure id="2"><div class="source"><a href="Ma%20page/data.xlsx">data.xlsx</a></div></figure>',
      ),
      resolveur(),
    );
    expect(converti.corps).toBe('[📎 cours.pdf](assets/cours.pdf)\n\nLire [le cours](assets/cours.pdf).\n\n📎 data.xlsx\n');
    expect(converti.avertissements).toEqual(['Des fichiers joints (autres que des images et des PDF) ne sont pas importés : leur nom reste dans la page.']);
    const { document, source } = lireMarkdown(converti.corps);
    expect(ecrireMarkdown(document, source)).toBe(converti.corps);
  });

  it('fait d’un tableau simple un tableau, les sauts de ligne en <br>', () => {
    expect(
      corpsDe('<table id="1" class="simple-table"><thead class="simple-table-header"><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1<br/>2</td><td>3</td></tr></tbody></table>'),
    ).toBe('| A      | B   |\n| ------ | --- |\n| 1<br>2 | 3   |\n');
  });

  it('montre une base selon le choix : tableau avec mentions, tableau seul, rien', () => {
    const mention = '[Sous page](notes://01a12ec7-ce85-7353-95f9-bed4d2e45c19)';
    expect(corpsDe(base, ['tableau-et-pages'])).toBe(`### Lectures\n\n| Nom${' '.repeat(mention.length - 3)} | Statut |\n| ${'-'.repeat(mention.length)} | ------ |\n| ${mention} | Lu     |\n`);
    expect(corpsDe(base, ['tableau'])).toBe('### Lectures\n\n| Nom       | Statut |\n| --------- | ------ |\n| Sous page | Lu     |\n');
    expect(corpsDe(base, ['pages'])).toBe('');
    expect(corpsDe(base, ['ignorer'])).toBe('');
  });

  it('fait le tableau d’une base exportée en CSV, et oublie ses métadonnées', () => {
    const corps =
      '<a href="Lectures%200123456789abcdef0123456789abcdef.csv"><code>Lectures 0123456789abcdef0123456789abcdef.csv</code></a><br/><div style="font-size:0.7em"><b>Métadonnées : filtres et tris</b><br/>Les filtres<table><tbody><tr><th>Nom</th></tr></tbody></table></div>';
    const mention = '[Sous page](notes://01a12ec7-ce85-7353-95f9-bed4d2e45c19)';
    expect(corpsDe(corps, ['tableau-et-pages'])).toBe(
      `| Nom${' '.repeat(mention.length - 3)} | Statut         |\n| ${'-'.repeat(mention.length)} | -------------- |\n| ${mention} | Lu             |\n| Inconnue${' '.repeat(mention.length - 8)} | Deux<br>lignes |\n`,
    );
    expect(corpsDe(corps, ['pages'])).toBe('');
  });

  it('reprend les callouts en <aside> avec leur emoji en attribut, et les blocs dépliables posés dans la page', () => {
    expect(
      corpsDe(
        '<aside class="block-color-yellow_background callout" data-notion-callout-icon="👋"><div style="font-size:1.5em"><span class="icon" data-emoji="👋"></span></div><div style="width:100%">Bienvenue<p>Suite</p></div></aside><details class="toggle"><summary>Code</summary><div class="indented"><script src="https://exemple.fr/a.js"></script><p>dedans</p></div></details>',
      ),
    ).toBe('```notes-callout\ntype: warning\nicon: 👋\ntext: |-\n  Bienvenue\n\n  Suite\n```\n\n- Code\n\n  dedans\n');
  });

  it('met les propriétés d’une ligne de base en tête de sa page', () => {
    const html = page(
      '<p>Contenu</p>',
      '<table class="properties"><tbody><tr class="property-row"><th><span class="icon property-icon"></span>Statut</th><td><span class="selected-value">Lu</span></td></tr><tr><th>Vide</th><td></td></tr></tbody></table>',
    );
    expect(convertirPageNotion(html, resolveur()).corps).toBe('- **Statut** : Lu\n\nContenu\n');
  });

  it('rend un Markdown que Notes relit à l’identique', () => {
    const corps = corpsDe(
      '<h2>T</h2><ul class="bulleted-list"><li>a</li></ul><figure class="block-color-gray_background callout"><div><span class="icon">💡</span></div><div style="width:100%">Note</div></figure><ul class="to-do-list"><li><div class="checkbox checkbox-off"></div> <span>t</span></li></ul>' +
        base,
    );
    const { document, source } = lireMarkdown(corps);
    expect(ecrireMarkdown(document, source)).toBe(corps);
    document.forEach((bloc) => expect(bloc.type.name).not.toBe('rawBlock'));
  });
});

describe('analyserPageNotion', () => {
  it('relève titre, icône, images, pages liées et bases', () => {
    const html = page(`<figure class="image"><img src="Ma%20page/chat.png"/></figure><p><a href="Ma%20page/Sous%20page%200123.html">Sous page</a> <a href="https://exemple.fr">web</a></p>${base}`, '<div class="page-header-icon undefined"><span class="icon">📝</span></div>');
    expect(analyserPageNotion(html)).toEqual({
      titre: 'Ma page',
      icone: { nature: 'emoji', valeur: '📝' },
      images: ['Ma%20page/chat.png'],
      fichiers: [],
      liens: ['Ma%20page/Sous%20page%200123.html'],
      bases: [{ rang: 0, titre: 'Lectures', lignes: ['Ma%20page/Sous%20page%200123.html'], csv: null }],
      texte: expect.stringContaining('Sous page web') as unknown as string,
      vide: false,
    });
  });

  it('dit qu’une page est vide', () => {
    expect(analyserPageNotion(page('<p></p><p> </p>')).vide).toBe(true);
    expect(analyserPageNotion(page('<p>texte</p>')).vide).toBe(false);
    // Une ligne de base sans texte mais avec des propriétés remplies n'est pas vide.
    expect(analyserPageNotion(page('', '<table class="properties"><tr><th>Statut</th><td>Refusé</td></tr></table>')).vide).toBe(false);
    expect(analyserPageNotion(page('', '<table class="properties"><tr><th>Statut</th><td></td></tr></table>')).vide).toBe(true);
  });

  it('relève une icône image', () => {
    const html = page('', '<div class="page-header-icon page-header-icon-with-cover"><img class="icon" src="Ma%20page/icone.png"/></div>');
    expect(analyserPageNotion(html).icone).toEqual({ nature: 'image', adresse: 'Ma%20page/icone.png' });
    expect(analyserPageNotion(html).images).toEqual(['Ma%20page/icone.png']);
  });
});
