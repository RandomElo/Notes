import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { editeur, fermer, lancer, lireCorps, lireVault, ouvrirPage, preparer } from './app';

// Écran de résolution des conflits (README §5), sur une page qui a une version mise de côté.

const corpsA = 'Sortie longue dimanche : 18 km, puis footing.\n\n- Jeudi : 3 × 3 km\n\nFin\n';
const corpsB = 'Sortie longue dimanche : 20 km, puis footing.\n\n* Jeudi : 2 × 5 km\n\nFin\n';
const sauvegarde = 'Courses/page.conflit-2026-10-03-190212.md';

test('un conflit se résout dans la page : choix, poignée, validation', async () => {
  const dossiers = await preparer();
  const fichier = join(dossiers.vault, 'Courses', 'page.md');
  const enTete = (await readFile(fichier, 'utf8')).split('---\n').slice(0, 2).join('---\n') + '---\n';
  await writeFile(fichier, enTete + corpsA);
  await writeFile(join(dossiers.vault, sauvegarde), enTete + corpsB);
  const session = await lancer(dossiers);
  const { page, vault } = session;

  await ouvrirPage(page, 'Courses');
  const bandeau = page.getByRole('alert').filter({ hasText: 'modifiée ailleurs' });
  await expect(bandeau).toBeVisible();
  await bandeau.getByRole('button', { name: 'Résoudre' }).click();

  const valider = page.getByRole('button', { name: 'Valider' });
  await expect(valider).toBeDisabled();
  const barres = page.getByRole('toolbar');
  await expect(barres).toHaveCount(2);

  // Paragraphe : les deux passages, B après A.
  await barres.nth(0).getByRole('button', { name: 'Les deux' }).click();
  await expect(valider).toBeDisabled();
  // Bloc : la version B remonte au-dessus du paragraphe par sa poignée, A reste gardée d'office.
  await page.locator('[data-poignee="b"]').focus();
  await page.keyboard.press('Control+Shift+ArrowUp');
  await expect(page.locator('[data-poignee="b"]')).toBeFocused();
  await expect(valider).toBeEnabled();

  await page.getByRole('button', { name: 'Aperçu' }).click();
  await expect(page.locator('article .notes-page').first()).toContainText('Jeudi : 2 × 5 km');
  await valider.click();

  // Retour à la page, enregistrée, et la version mise de côté a disparu.
  await expect(editeur(page)).toContainText('18 km, 20 km');
  await expect(bandeau).toHaveCount(0);
  expect(await lireCorps(vault, 'Courses')).toBe('* Jeudi : 2 × 5 km\n\nSortie longue dimanche : 18 km, 20 km, puis footing.\n\n- Jeudi : 3 × 3 km\n\nFin\n');
  expect(Object.keys(await lireVault(vault))).not.toContain(sauvegarde);
  await fermer(session);
});

test('« Tout A » rend la page à l’identique, et revenir à la page ne change rien', async () => {
  const dossiers = await preparer();
  const fichier = join(dossiers.vault, 'Courses', 'page.md');
  const enTete = (await readFile(fichier, 'utf8')).split('---\n').slice(0, 2).join('---\n') + '---\n';
  await writeFile(fichier, enTete + corpsA);
  await writeFile(join(dossiers.vault, sauvegarde), enTete + corpsB);
  const session = await lancer(dossiers);
  const { page, vault } = session;
  const avant = await lireVault(vault);

  await ouvrirPage(page, 'Courses');
  await page.getByRole('button', { name: 'Résoudre' }).click();
  await page.getByRole('button', { name: 'Retour' }).click();
  await expect(editeur(page)).toBeVisible();
  expect(await lireVault(vault)).toEqual(avant);

  await page.getByRole('button', { name: 'Résoudre' }).click();
  await page.getByRole('button', { name: 'Tout A' }).click();
  await page.getByRole('button', { name: 'Valider' }).click();
  await expect(editeur(page)).toBeVisible();
  expect(await lireCorps(vault, 'Courses')).toBe(corpsA);
  expect(Object.keys(await lireVault(vault))).not.toContain(sauvegarde);
  await fermer(session);
});
