import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { fermer, lancer, ligne, lireVault, ouvrirPage, preparer, titreDePage } from './app';

// Types du DOM, évalués dans la fenêtre : le projet des essais n'a pas la bibliothèque DOM.
declare const DataTransfer: new () => unknown;

// Critère de J10 : une page supprimée revient intégralement ; plusieurs pages sélectionnées se déplacent
// et se suppriment ensemble. Sans NAS réglé, la corbeille reste sur le poste (`.trash/` du dossier des notes).

const titresAffiches = (page: Page) => page.locator('[role="treeitem"] span[title]').evaluateAll((spans) => spans.map((span) => span.textContent));
const titresSelectionnes = (page: Page) =>
  page.locator('[role="treeitem"][aria-selected="true"] span[title]').evaluateAll((spans) => spans.map((span) => span.textContent));
const entreesDeLaCorbeille = async (vault: string) => (await readdir(join(vault, '.trash')).catch(() => [])).sort();
const sansCorbeille = (fichiers: Record<string, string>) => Object.fromEntries(Object.entries(fichiers).filter(([chemin]) => !chemin.startsWith('.trash/')));

test('critère de J10 : une page supprimée avec ses sous-pages est restaurée intégralement', async () => {
  const session = await lancer(await preparer());
  const { page, vault } = session;
  const avant = await lireVault(vault);

  await ouvrirPage(page, 'Projets');
  await ligne(page, 'Projets').focus();
  // Une page qui a des sous-pages demande confirmation ; Échap abandonne, Entrée confirme.
  await page.keyboard.press('Delete');
  const confirmation = page.getByRole('alertdialog', { name: 'Mettre à la corbeille' });
  await expect(confirmation).toContainText('« Projets » a 2 sous-pages : elles partent aussi à la corbeille.');
  await page.keyboard.press('Escape');
  await expect(confirmation).toHaveCount(0);
  await expect(ligne(page, 'Projets')).toBeFocused();
  await page.keyboard.press('Delete');
  await expect(confirmation).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(ligne(page, 'Projets')).toHaveCount(0);
  // L'onglet de la page supprimée se vide, le focus passe à la ligne suivante.
  await expect(titreDePage(page)).toHaveCount(0);
  await expect(ligne(page, 'Courses')).toBeFocused();
  const [entree, ...autres] = await entreesDeLaCorbeille(vault);
  expect(autres).toEqual([]);
  expect(entree).toMatch(/ Projets$/);
  const pendant = await lireVault(vault);
  for (const [chemin, contenu] of Object.entries(avant).filter(([chemin]) => chemin.startsWith('Projets/'))) {
    expect(pendant[`.trash/${entree}/${chemin}`]).toBe(contenu);
  }
  expect(Object.keys(pendant).some((chemin) => chemin.startsWith('Projets/'))).toBe(false);

  // L'écran de la corbeille : l'entrée, son aperçu avec ses sous-pages, « Restaurer ».
  await page.getByRole('button', { name: 'Corbeille' }).click();
  const liste = page.getByRole('list', { name: 'Éléments de la corbeille' });
  await expect(liste.getByRole('button')).toHaveCount(1);
  await expect(liste).toContainText('Projets');
  await expect(liste).toContainText("aujourd'hui");
  const apercu = page.getByRole('region', { name: 'Aperçu de Projets' });
  await expect(apercu).toContainText('2 sous-pages, restaurées avec elle');
  await expect(apercu).toContainText('Refonte du NAS');
  await expect(apercu).toContainText('Effacée dans 30 jours');
  await apercu.getByRole('button', { name: 'Restaurer' }).click();
  await expect(page.getByRole('status').filter({ hasText: '« Projets » est revenue à la racine.' })).toBeVisible();
  await expect(page.getByText('La corbeille est vide.')).toHaveCount(0);
  await expect(liste).toHaveCount(0);

  // Tout est revenu à l'octet près, ordre de la racine compris : la page a retrouvé sa place.
  expect(await entreesDeLaCorbeille(vault)).toEqual([]);
  expect(sansCorbeille(await lireVault(vault))).toEqual(avant);

  // « Ouvrir » mène à la page, Échap aurait aussi rendu la page.
  await page.getByRole('button', { name: 'Ouvrir' }).click();
  await expect(titreDePage(page)).toHaveText('Projets');
  await fermer(session);
});

test('sélection multiple : Maj+↑/↓, Maj+clic, glisser-déposer groupé, Suppr', async () => {
  const session = await lancer(await preparer());
  const { page, vault } = session;
  expect(await titresAffiches(page)).toEqual(['Bienvenue', 'Projets', 'Courses', 'Journal', 'Note externe']);

  // Maj+↓ depuis la page ouverte, puis Maj+↑ qui revient : la sélection suit l'ancre.
  await ouvrirPage(page, 'Projets');
  await ligne(page, 'Projets').focus();
  await page.keyboard.press('Shift+ArrowDown');
  await page.waitForTimeout(30);
  await page.keyboard.press('Shift+ArrowDown');
  expect(await titresSelectionnes(page)).toEqual(['Projets', 'Courses', 'Journal']);
  await page.keyboard.press('Shift+ArrowUp');
  expect(await titresSelectionnes(page)).toEqual(['Projets', 'Courses']);
  await page.keyboard.press('Escape');
  // Échap défait la sélection : seule la page ouverte garde son fond.
  expect(await titresSelectionnes(page)).toEqual(['Projets']);
  // Un élément non importé n'entre pas dans une sélection.
  await ligne(page, 'Journal').click();
  await ligne(page, 'Note externe (non importé)').click({ modifiers: ['Shift'] });
  expect(await titresSelectionnes(page)).toEqual(['Journal']);

  // Maj+clic : de la page ouverte à la page cliquée, sans l'ouvrir.
  await ouvrirPage(page, 'Courses');
  await ligne(page, 'Journal').click({ modifiers: ['Shift'] });
  expect(await titresSelectionnes(page)).toEqual(['Courses', 'Journal']);
  await expect(titreDePage(page)).toHaveText('Courses');

  // Le menu de la sélection agit sur toutes les pages.
  await ligne(page, 'Journal').click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: /Mettre les 2 pages à la corbeille/ })).toBeVisible();
  await page.keyboard.press('Escape');

  // Glisser une des pages sélectionnées dans « Bienvenue » emmène les deux, dans leur ordre.
  const cible = ligne(page, 'Bienvenue');
  const boite = await cible.boundingBox();
  if (boite === null) {
    throw new Error('ligne introuvable');
  }
  const transfert = await page.evaluateHandle(() => new DataTransfer());
  await ligne(page, 'Journal').dispatchEvent('dragstart', { dataTransfer: transfert });
  await page.waitForTimeout(50);
  await cible.dispatchEvent('dragover', { dataTransfer: transfert, clientX: boite.x + 40, clientY: boite.y + boite.height / 2 });
  await page.waitForTimeout(50);
  await cible.dispatchEvent('drop', { dataTransfer: transfert, clientX: boite.x + 40, clientY: boite.y + boite.height / 2 });
  await ligne(page, 'Journal').dispatchEvent('dragend', { dataTransfer: transfert });
  await expect.poll(() => titresAffiches(page)).toEqual(['Bienvenue', 'Courses', 'Journal', 'Projets', 'Note externe']);
  const fichiers = await lireVault(vault);
  expect(fichiers['Bienvenue/Courses/page.md']).toContain('title: Courses');
  expect(fichiers['Bienvenue/Journal/2026/page.md']).toBeDefined();
  expect(fichiers['Bienvenue/.order']?.trim().split('\n')).toEqual(['0199a0b0-0000-7000-8000-000000000005', '0199a0b0-0000-7000-8000-000000000006']);
  // La sélection survit au déplacement : Suppr met les deux pages à la corbeille.
  expect(await titresSelectionnes(page)).toEqual(['Courses', 'Journal']);
  await ligne(page, 'Courses').focus();
  await page.keyboard.press('Delete');
  // Journal a des sous-pages : confirmation pour l'ensemble.
  await expect(page.getByRole('alertdialog')).toContainText('Les 2 pages partent à la corbeille avec leurs sous-pages (2 sous-pages).');
  await page.getByRole('button', { name: 'Mettre à la corbeille' }).click();
  await expect(ligne(page, 'Courses')).toHaveCount(0);
  await expect(ligne(page, 'Journal')).toHaveCount(0);
  const entrees = await entreesDeLaCorbeille(vault);
  expect(entrees).toHaveLength(2);
  expect(entrees.some((entree) => entree.endsWith(' Courses'))).toBe(true);
  expect(entrees.some((entree) => entree.endsWith(' Journal'))).toBe(true);
  expect(Object.keys(await lireVault(vault)).some((chemin) => chemin.startsWith('Bienvenue/Courses') || chemin.startsWith('Bienvenue/Journal'))).toBe(false);

  // Supprimer définitivement demande une confirmation, à côté du bouton.
  await page.getByRole('button', { name: 'Corbeille' }).click();
  const liste = page.getByRole('list', { name: 'Éléments de la corbeille' });
  await expect(liste.getByRole('button')).toHaveCount(2);
  await page.getByRole('button', { name: 'Supprimer définitivement' }).click();
  await page.keyboard.press('Escape');
  // Échap annule la confirmation sans quitter la corbeille.
  await expect(page.getByRole('button', { name: 'Supprimer définitivement' })).toBeVisible();
  await page.getByRole('button', { name: 'Supprimer définitivement' }).click();
  await page.getByRole('button', { name: 'Effacer pour de bon' }).click();
  await expect(liste.getByRole('button')).toHaveCount(1);
  expect(await entreesDeLaCorbeille(vault)).toHaveLength(1);
  await page.getByRole('button', { name: 'Vider la corbeille' }).click();
  await page.getByRole('button', { name: 'Tout effacer pour de bon' }).click();
  await expect(page.getByText('La corbeille est vide.')).toBeVisible();
  expect(await entreesDeLaCorbeille(vault)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.getByText('La corbeille est vide.')).toHaveCount(0);

  // Une page sans sous-page part sans confirmation.
  await ligne(page, 'Bienvenue').focus();
  await page.keyboard.press('Delete');
  await expect(ligne(page, 'Bienvenue')).toHaveCount(0);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  expect(await entreesDeLaCorbeille(vault)).toHaveLength(1);

  await fermer(session);
});

test('images inutilisées : tout mettre à la corbeille, avec confirmation', async () => {
  const dossiers = await preparer();
  await mkdir(join(dossiers.vault, 'Courses', 'assets'), { recursive: true });
  await writeFile(join(dossiers.vault, 'Courses', 'assets', 'vieille-1.png'), 'x');
  await writeFile(join(dossiers.vault, 'Courses', 'assets', 'vieille-2.png'), 'y');
  const session = await lancer(dossiers);
  const { page, vault } = session;

  await page.getByRole('button', { name: 'Réglages' }).click();
  const section = page.getByRole('region', { name: 'Images inutilisées' });
  await section.getByRole('button', { name: 'Chercher' }).click();
  await expect(section.getByRole('status').filter({ hasText: '2 images inutilisées.' })).toBeVisible();
  await page.getByRole('button', { name: 'Tout mettre à la corbeille' }).click();
  // Échap annule la confirmation sans fermer les réglages.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Tout mettre à la corbeille' })).toBeVisible();
  await page.getByRole('button', { name: 'Tout mettre à la corbeille' }).click();
  await page.getByRole('button', { name: 'Mettre les 2 images à la corbeille' }).click();
  await expect(section.getByRole('status').filter({ hasText: 'Aucune image inutilisée.' })).toBeVisible();
  const entrees = await entreesDeLaCorbeille(vault);
  expect(entrees).toHaveLength(2);
  expect(entrees.every((entree) => / vieille-\d\.png$/.test(entree))).toBe(true);
  await fermer(session);
});
