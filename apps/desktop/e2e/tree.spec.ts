import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { attendreEnregistrement, editeur, fermer, lancer, ligne, lireVault, ouvrirPage, preparer, titreDePage } from './app';

// Types du DOM, évalués dans la fenêtre : le projet des essais n'a pas la bibliothèque DOM.
declare const DataTransfer: new () => unknown;
declare function getComputedStyle(element: unknown): { height: string; borderRadius: string; backgroundColor: string; boxShadow: string; outlineWidth: string; outlineStyle: string };

// Retouches du lot 2 : création par Ctrl+N, abandon d'une page vide par Échap, Échap dans les réglages.

const titresAffiches = (page: Page) => page.locator('[role="treeitem"] span[title]').evaluateAll((spans) => spans.map((span) => span.textContent));
const champDuNom = (page: Page) => page.getByRole('tree').getByRole('textbox', { name: 'Titre de la page' });

test('Ctrl+N crée une page sœur juste après la page ouverte, Ctrl+Maj+N à la racine', async () => {
  const session = await lancer(await preparer());
  const { page, vault } = session;

  await ouvrirPage(page, 'Courses');
  await page.keyboard.press('Control+n');
  await champDuNom(page).waitFor();
  await page.keyboard.type('Sœur de Courses', { delay: 15 });
  await page.keyboard.press('Enter');
  await expect(ligne(page, 'Sœur de Courses')).toBeVisible();
  const racine = await titresAffiches(page);
  expect(racine.indexOf('Sœur de Courses')).toBe(racine.indexOf('Courses') + 1);
  expect(await readFile(join(vault, 'Sœur de Courses', 'page.md'), 'utf8')).toContain('title: Sœur de Courses');

  // Depuis une sous-page : la nouvelle page reste au même niveau, sous le même parent.
  await ligne(page, 'Projets').locator('button[aria-label="Déplier"]').click();
  await ouvrirPage(page, 'Refonte du NAS');
  await page.keyboard.press('Control+n');
  await champDuNom(page).waitFor();
  await page.keyboard.type('Voisine', { delay: 15 });
  await page.keyboard.press('Enter');
  await expect(ligne(page, 'Voisine')).toBeVisible();
  expect(await readFile(join(vault, 'Projets', 'Voisine', 'page.md'), 'utf8')).toContain('title: Voisine');
  const projets = await titresAffiches(page);
  expect(projets.indexOf('Voisine')).toBe(projets.indexOf('Refonte du NAS') + 1);

  await page.keyboard.press('Control+Shift+N');
  await champDuNom(page).waitFor();
  await page.keyboard.type('À la racine', { delay: 15 });
  await page.keyboard.press('Enter');
  await expect(ligne(page, 'À la racine')).toBeVisible();
  expect(await readFile(join(vault, 'À la racine', 'page.md'), 'utf8')).toContain('title: À la racine');

  await fermer(session);
});

test('Échap sur le nom d’une page neuve la supprime et rouvre la page d’avant', async () => {
  const session = await lancer(await preparer());
  const { page, vault } = session;
  const avant = await lireVault(vault);

  await ouvrirPage(page, 'Courses');
  await page.keyboard.press('Control+n');
  await expect(champDuNom(page)).toHaveValue('Sans titre');
  await page.keyboard.press('Escape');
  await expect(ligne(page, 'Sans titre')).toHaveCount(0);
  await expect(titreDePage(page)).toHaveText('Courses');
  await expect(ligne(page, 'Courses')).toBeFocused();
  // Rien ne reste sur le disque, pas même la ligne dans l'ordre.
  expect(await lireVault(vault)).toEqual(avant);

  // Même chose pour une sous-page créée par le bouton de la ligne.
  await ligne(page, 'Courses').hover();
  await page.getByRole('button', { name: 'Nouvelle sous-page dans Courses' }).click();
  await champDuNom(page).waitFor();
  await page.keyboard.press('Escape');
  await expect(ligne(page, 'Sans titre')).toHaveCount(0);
  expect(await lireVault(vault)).toEqual(avant);

  await fermer(session);
});

test('Échap garde une page « Sans titre » qui a du contenu', async () => {
  const session = await lancer(await preparer());
  const { page, vault } = session;

  await page.keyboard.press('Control+Shift+N');
  await champDuNom(page).waitFor();
  await page.keyboard.press('Enter');
  await editeur(page).click();
  await page.keyboard.type('Une phrase à garder.', { delay: 15 });
  await attendreEnregistrement(page);

  await ligne(page, 'Sans titre').focus();
  await page.keyboard.press('F2');
  await champDuNom(page).waitFor();
  await page.keyboard.press('Escape');
  await expect(champDuNom(page)).toHaveCount(0);
  await page.waitForTimeout(500);
  await expect(ligne(page, 'Sans titre')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await readFile(join(vault, 'Sans titre', 'page.md'), 'utf8')).toContain('Une phrase à garder.');

  await fermer(session);
});

test('Échap ferme l’écran du thème, puis les réglages', async () => {
  const session = await lancer(await preparer());
  const { page } = session;

  await ouvrirPage(page, 'Courses');
  await page.getByRole('button', { name: 'Réglages', exact: true }).click();
  await page.getByRole('button', { name: 'Modifier le thème' }).click();
  await expect(page.getByLabel('Aperçu du thème')).toBeVisible();

  // Une liste ouverte se ferme d'abord, sans quitter l'écran.
  const titre1 = page.getByRole('group', { name: 'Titre 1', exact: true });
  await titre1.getByLabel('Couleur', { exact: true }).click();
  await expect(titre1.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(titre1.getByRole('listbox')).toHaveCount(0);
  await expect(page.getByLabel('Aperçu du thème')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Aperçu du thème')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Connexion au NAS' })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Connexion au NAS' })).toHaveCount(0);
  await expect(titreDePage(page)).toHaveText('Courses');
  // Le bouton « Réglages » garde le focus : il se montre par son fond, sans contour.
  const reglages = page.getByRole('button', { name: 'Réglages', exact: true });
  const focus = await reglages.evaluate((element) => {
    const calcule = getComputedStyle(element);
    return { focalise: element.matches(':focus-visible'), contour: calcule.outlineWidth, style: calcule.outlineStyle, fond: calcule.backgroundColor };
  });
  if (focus.focalise) {
    expect(focus.style === 'none' || focus.contour === '0px').toBe(true);
    expect(focus.fond).not.toBe('rgba(0, 0, 0, 0)');
  }

  await fermer(session);
});

test('la barre de dépôt est un trait plat de 2 px, aux bouts droits', async () => {
  const session = await lancer(await preparer());
  const { page } = session;

  const source = ligne(page, 'Courses');
  const cible = ligne(page, 'Journal');
  const boite = await cible.boundingBox();
  if (boite === null) {
    throw new Error('ligne introuvable');
  }
  const transfert = await page.evaluateHandle(() => new DataTransfer());
  await source.dispatchEvent('dragstart', { dataTransfer: transfert });
  await page.waitForTimeout(50);
  // Haut de la ligne : dépôt avant.
  await cible.dispatchEvent('dragover', { dataTransfer: transfert, clientX: boite.x + 40, clientY: boite.y + 2 });
  const trait = cible.locator('span[aria-hidden="true"].absolute');
  await expect(trait).toHaveCount(1);
  const styles = await trait.evaluate((element) => {
    const calcule = getComputedStyle(element);
    return { hauteur: calcule.height, arrondi: calcule.borderRadius, fond: calcule.backgroundColor };
  });
  expect(styles.hauteur).toBe('2px');
  expect(styles.arrondi).toBe('0px');
  expect(styles.fond).not.toBe('rgba(0, 0, 0, 0)');
  // La ligne elle-même n'a plus d'ombre intérieure.
  expect(await cible.evaluate((element) => getComputedStyle(element).boxShadow)).toBe('none');

  await source.dispatchEvent('dragend', { dataTransfer: transfert });
  await expect(trait).toHaveCount(0);
  await fermer(session);
});
