import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { editeur, fermer, lancer, ouvrirPage, preparer } from './app';

// Les fonctions passées à « evaluate » s'exécutent dans la page : ce fichier, lui, est compilé sans les types du DOM.
declare function getComputedStyle(element: unknown, pseudo?: string): { color: string; getPropertyValue(nom: string): string };

// Critère de sortie de J4 : une modification du TOML est visible à chaud, et la hiérarchie des titres est lisible.

const style = (element: Locator, propriete: string) => element.evaluate((noeud, nom) => getComputedStyle(noeud).getPropertyValue(nom), propriete);
const rouge = 'rgb(255, 0, 0)';

/** Ouvre l'éditeur de thème : les réglages, puis le bouton qui y mène. */
async function ouvrirEditeurDeTheme(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Réglages', exact: true }).click();
  await page.getByRole('button', { name: 'Modifier le thème' }).click();
}

test('le thème par défaut donne cinq niveaux de titre qu’on distingue', async () => {
  const session = await lancer(await preparer());
  const { page } = session;
  await ouvrirPage(page, 'Bienvenue');
  const contenu = editeur(page);
  const signes: string[] = [];
  for (const niveau of [1, 2, 3, 4, 5]) {
    const titre = contenu.locator(`h${niveau}`).first();
    signes.push(
      [await style(titre, 'font-size'), await style(titre, 'font-weight'), await style(titre, 'font-style'), await style(titre, 'text-decoration-line'), await style(titre, 'color')].join(' '),
    );
  }
  expect(signes).toEqual([
    // Palette « Feux » : rouge, orange, jaune, vert, gris.
    '25.6px 700 normal none rgb(248, 113, 113)',
    '20.8px 700 normal underline rgb(251, 146, 60)',
    '17.6px 600 italic none rgb(250, 204, 21)',
    '16px 600 normal none rgb(74, 222, 128)',
    '16px 400 italic none rgb(154, 160, 171)',
  ]);
  // Aucun niveau ne ressemble à un autre.
  expect(new Set(signes).size).toBe(5);
  await fermer(session);
});

test('une modification de theme.toml se voit sans relancer, et une valeur fausse ne casse rien', async () => {
  const session = await lancer(await preparer());
  const { page, vault } = session;
  await ouvrirPage(page, 'Bienvenue');
  const titre = editeur(page).locator('h1').first();
  const barre = page.getByRole('navigation', { name: 'Arborescence des pages' });
  const puce = editeur(page).locator('ul:not([data-type]) > li').first();
  const avis = page.getByRole('status').filter({ hasText: 'Thème :' });
  await expect.poll(() => style(titre, 'font-size')).toBe('25.6px');
  expect((await barre.boundingBox())?.width).toBe(288);

  // Le fichier apparaît : il est appliqué tout de suite.
  const fichier = join(vault, '.notes', 'theme.toml');
  await mkdir(join(vault, '.notes'));
  await writeFile(fichier, '[colors]\naccent = "#ff0000"\n\n[heading.h1]\nsize = "2rem"\nitalic = true\ncolor = "accent"\n\n[ui]\nsidebar_width = "20rem"\n\n[list]\nbullet_1 = "accent"\n');
  await expect.poll(() => style(titre, 'font-size')).toBe('32px');
  expect(await style(titre, 'font-style')).toBe('italic');
  expect(await style(titre, 'color')).toBe(rouge);
  // La puce suit l'accent, qu'elle désigne par son nom.
  expect(await puce.evaluate((noeud) => getComputedStyle(noeud, '::marker').color)).toBe(rouge);
  expect((await barre.boundingBox())?.width).toBe(320);
  await expect(avis).toHaveCount(0);

  // Il change : l'affichage suit.
  await writeFile(fichier, '[heading.h1]\nsize = "3rem"\n');
  await expect.poll(() => style(titre, 'font-size')).toBe('48px');
  expect(await style(titre, 'font-style')).toBe('normal');
  expect((await barre.boundingBox())?.width).toBe(288);

  // Une valeur fausse : le défaut revient pour elle seule, le reste du fichier s'applique, et c'est signalé sans bloquer.
  await writeFile(fichier, '[heading.h1]\nsize = "énorme"\nweight = 400\n\n[couleurs]\naccent = "#00ff00"\n');
  await expect.poll(() => style(titre, 'font-weight')).toBe('400');
  expect(await style(titre, 'font-size')).toBe('25.6px');
  await expect(avis).toContainText('2 réglages ont été ignorés');
  // On écrit toujours dans la page.
  await editeur(page).locator('p').first().click();
  await page.keyboard.type('x', { delay: 15 });
  await avis.getByRole('button', { name: 'Voir' }).click();
  const ignores = page.getByRole('status', { name: 'Réglages ignorés' });
  await expect(ignores).toContainText('heading.h1.size : "énorme" n\'est pas une taille');
  await expect(ignores).toContainText('couleurs : réglage inconnu, ignoré.');
  await expect(page.getByText(fichier)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ouvrir le fichier de thème' })).toBeEnabled();

  // Un fichier illisible : thème par défaut, toujours sans blocage.
  await writeFile(fichier, '[heading.h1\nsize = \n');
  await expect(ignores).toContainText("Le fichier n'est pas lisible (ligne 1)");
  await ouvrirPage(page, 'Bienvenue');
  await expect.poll(() => style(titre, 'font-weight')).toBe('700');

  // Le fichier disparaît : thème par défaut, plus d'avertissement.
  await rm(fichier);
  await expect(avis).toHaveCount(0);
  await ouvrirEditeurDeTheme(page);
  await expect(page.getByText("Aucun fichier de thème : le thème par défaut s'applique.", { exact: false })).toBeVisible();
  // Le bouton crée le fichier avec les valeurs par défaut, puis demande au système de l'ouvrir.
  // L'ouverture est remplacée dans le main, pour ne pas lancer un éditeur de texte sur le poste.
  await session.application.evaluate(({ shell }) => {
    const ouverts: string[] = [];
    (globalThis as unknown as { ouverts: string[] }).ouverts = ouverts;
    shell.openPath = async (chemin: string) => {
      ouverts.push(chemin);
      return '';
    };
  });
  await page.getByRole('button', { name: 'Créer le fichier de thème' }).click();
  await expect(page.getByText('Le fichier de thème est appliqué.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ouvrir le fichier de thème' })).toBeEnabled();
  expect(await readFile(fichier, 'utf8')).toContain('[heading.h2]\nsize = "1.3rem"');
  expect(await session.application.evaluate(() => (globalThis as unknown as { ouverts: string[] }).ouverts)).toEqual([fichier]);
  await fermer(session);
});

test('le thème se règle dans les réglages : effet immédiat, fichier écrit, saisie fausse refusée, retour au défaut', async () => {
  const session = await lancer(await preparer());
  const { page, vault } = session;
  const fichier = join(vault, '.notes', 'theme.toml');
  // Les réglages ne montrent que l'état du thème et le bouton qui mène à son écran.
  await page.getByRole('button', { name: 'Réglages', exact: true }).click();
  await expect(page.getByText('Thème par défaut.')).toBeVisible();
  await expect(page.getByLabel('Aperçu du thème')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Connexion au NAS' })).toBeVisible();
  await page.getByRole('button', { name: 'Modifier le thème' }).click();
  await expect(page.getByRole('heading', { name: 'Connexion au NAS' })).toHaveCount(0);
  const apercu = page.getByLabel('Aperçu du thème');
  const enregistre = page.getByRole('status', { name: 'Enregistrement du thème' });
  const titre1 = page.getByRole('group', { name: 'Titre 1', exact: true });
  const couleurs = page.getByRole('group', { name: 'Palette', exact: true });
  const taille = titre1.getByLabel('Taille', { exact: true });
  await expect(taille).toHaveValue('1.6');

  // Un réglage : l'aperçu suit tout de suite, puis le fichier est écrit.
  await taille.fill('2');
  await expect.poll(() => style(apercu.locator('h1'), 'font-size')).toBe('32px');
  await expect(enregistre).toHaveText('Thème enregistré');
  expect(await readFile(fichier, 'utf8')).toContain('[heading.h1]\nsize = "2rem"');
  await titre1.getByLabel('Italique').check();
  // La couleur d'un titre se prend dans une liste où chaque couleur a sa pastille.
  await titre1.getByLabel('Couleur', { exact: true }).click();
  const choixDeCouleur = titre1.getByRole('listbox', { name: 'Couleur' });
  await expect(choixDeCouleur.getByRole('option')).toHaveCount(10);
  await expect(choixDeCouleur.getByRole('option', { name: 'Couleur choisie…' })).toBeInViewport();
  // Par défaut, le titre 1 a sa propre couleur (palette « Feux »), pas une couleur de la palette.
  await expect(choixDeCouleur.getByRole('option', { selected: true })).toHaveText('Couleur choisie…');
  await choixDeCouleur.getByRole('option', { name: 'Accent' }).click();
  await expect(choixDeCouleur).toHaveCount(0);
  await expect(titre1.getByLabel('Couleur', { exact: true })).toHaveText('Accent');
  await couleurs.getByLabel('Accent', { exact: true }).fill('#ff0000');
  await expect.poll(() => style(apercu.locator('h1'), 'color')).toBe(rouge);
  expect(await style(apercu.locator('h1'), 'font-style')).toBe('italic');
  await expect(enregistre).toHaveText('Thème enregistré');
  const ecrit = await readFile(fichier, 'utf8');
  expect(ecrit).toContain('accent = "#ff0000"');
  expect(ecrit).toContain('italic = true\nunderline = false\ncolor = "accent"');

  // Les listes déroulantes ont le fond de l'application, pas un fond clair où le texte ne se lit pas.
  const graisse = titre1.getByLabel('Graisse', { exact: true });
  expect(await style(graisse.locator('option').first(), 'background-color')).toBe('rgb(22, 23, 27)');
  expect(await style(graisse, 'color')).toBe('rgb(230, 231, 234)');

  // La couleur d'un titre se choisit aussi directement dans le carré : elle devient une couleur propre à ce titre.
  const titre2 = page.getByRole('group', { name: 'Titre 2', exact: true });
  // « Couleur choisie… » ouvre le sélecteur du système, rangé hors de l'écran. Il est rempli ici directement.
  await titre2.getByLabel('Couleur', { exact: true }).click();
  await expect(titre2.getByRole('option', { name: 'Couleur choisie…' })).toBeVisible();
  await page.keyboard.press('Escape');
  await titre2.getByLabel('Choisir Couleur').fill('#00ff00', { force: true });
  await expect.poll(() => style(apercu.locator('h2'), 'color')).toBe('rgb(0, 255, 0)');
  // Le trait sous le titre 2 a la couleur du titre.
  expect(await style(apercu.locator('h2'), 'text-decoration-color')).toBe('rgb(0, 255, 0)');
  await expect(titre2.getByLabel('Couleur', { exact: true })).toHaveText('Couleur choisie');
  // Au clavier aussi : flèches, Entrée, et Échap qui ferme sans rien changer.
  await titre2.getByLabel('Couleur', { exact: true }).focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');
  await expect(titre2.getByRole('listbox')).toHaveCount(0);
  await expect(titre2.getByLabel('Couleur', { exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect(titre2.getByLabel('Couleur', { exact: true })).toHaveText('Erreur');
  await expect.poll(() => style(apercu.locator('h2'), 'color')).toBe('rgb(240, 138, 138)');
  await titre2.getByLabel('Choisir Couleur').fill('#00ff00', { force: true });

  // Une infobulle explique les couleurs au survol du « i ».
  await titre1.getByRole('button', { name: 'Aide : Couleur' }).hover();
  await expect(titre1.getByRole('tooltip')).toBeVisible();
  await expect(titre1.getByRole('tooltip')).toContainText('suit la palette');
  await page.mouse.move(0, 0);

  // La police se choisit dans une liste, la police du système d'abord.
  const texte = page.getByRole('group', { name: 'Texte', exact: true });
  await expect(texte.getByLabel('Police', { exact: true })).toHaveValue('systeme');
  await expect(texte.getByLabel('Police', { exact: true }).locator('option').first()).toHaveText('Police du système');

  // Une saisie fausse est signalée sous le champ et n'est ni appliquée ni écrite.
  await expect.poll(async () => (await readFile(fichier, 'utf8')).includes('color = "#00ff00"')).toBe(true);
  const avant = await readFile(fichier, 'utf8');
  await couleurs.getByLabel('Accent', { exact: true }).fill('rouge');
  await expect(couleurs.getByRole('alert')).toContainText('Attendu : une couleur comme "#7aa2f7"');
  await page.waitForTimeout(700);
  expect(await readFile(fichier, 'utf8')).toBe(avant);
  expect(await style(apercu.locator('h1'), 'color')).toBe(rouge);

  // Le retour ramène aux réglages, qui disent que le thème est personnalisé.
  await page.getByRole('button', { name: 'Retour aux réglages' }).click();
  await expect(page.getByText('Thème personnalisé.')).toBeVisible();

  // La page elle-même a le nouveau thème.
  await ouvrirPage(page, 'Bienvenue');
  expect(await style(editeur(page).locator('h1').first(), 'font-size')).toBe('32px');

  // Retour au défaut d'un seul réglage, puis de tout le thème après confirmation.
  await ouvrirEditeurDeTheme(page);
  await titre1.getByRole('button', { name: 'Rétablir Taille' }).click();
  await expect(taille).toHaveValue('1.6');
  await expect.poll(() => style(apercu.locator('h1'), 'font-size')).toBe('25.6px');
  await page.getByRole('button', { name: 'Rétablir le thème par défaut' }).click();
  await page.getByRole('button', { name: 'Oui, rétablir' }).click();
  await expect.poll(() => style(apercu.locator('h1'), 'font-style')).toBe('normal');
  await expect(enregistre).toHaveText('Thème enregistré');
  await expect.poll(async () => (await readFile(fichier, 'utf8')).includes('accent = "#60a5fa"')).toBe(true);
  await expect(page.getByRole('button', { name: 'Rétablir le thème par défaut' })).toBeDisabled();

  // Un réglage fait juste avant de fermer la fenêtre est écrit quand même.
  await titre1.getByLabel('Taille', { exact: true }).fill('3');
  await fermer(session);
  expect(await readFile(fichier, 'utf8')).toContain('[heading.h1]\nsize = "3rem"');
});

test('les couleurs propres à une page ne changent que cette page, à chaud', async () => {
  const session = await lancer(await preparer());
  const { page, vault } = session;
  await ouvrirPage(page, 'Bienvenue');
  // La case d'une tâche prend la couleur d'accent.
  const caseATocher = editeur(page).locator('ul[data-type="taskList"] input').first();
  const couleur = () => style(caseATocher, 'accent-color');
  const defaut = await couleur();
  expect(defaut).toBe('rgb(96, 165, 250)');
  expect(defaut).not.toBe(rouge);

  const fichier = join(vault, 'Bienvenue', 'page.md');
  const texte = await readFile(fichier, 'utf8');
  // La taille n'est pas une couleur : elle est ignorée, la couleur est prise.
  await writeFile(fichier, texte.replace('\n---\n', '\ntheme_overrides:\n  accent: "#ff0000"\n  size: 3rem\n---\n'));
  await expect.poll(couleur).toBe(rouge);
  expect(await style(editeur(page).locator('h1').first(), 'font-size')).toBe('25.6px');
  // L'arborescence garde les couleurs du thème.
  expect(await style(page.getByRole('navigation', { name: 'Arborescence des pages' }), '--color-accent')).toBe('#60a5fa');

  // Une autre page n'est pas touchée.
  await ouvrirPage(page, 'Courses');
  expect(await style(editeur(page), '--color-accent')).toBe('#60a5fa');
  await fermer(session);
});
