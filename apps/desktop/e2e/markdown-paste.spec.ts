import { expect, test } from '@playwright/test';
import { attendreEnregistrement, editeur, fermer, lancer, lireCorps, ouvrirPage, preparerCoursesClassique } from './app';

// Ce que les fonctions passées à evaluate utilisent du DOM, que la configuration TypeScript des essais ne connaît pas.
declare const DataTransfer: new () => { setData(type: string, valeur: string): void };
declare const ClipboardEvent: new (type: string, options: { clipboardData: unknown; bubbles: boolean; cancelable: boolean }) => unknown;

// Texte Markdown collé (docs/spec/editeur.md) : une question propose de le mettre en forme ou de le garder en texte.

const markdown = '## Plan\n\n- premier point\n- second point';

test('du Markdown collé se met en forme ou reste du texte, selon la réponse', async () => {
  const session = await lancer(await preparerCoursesClassique());
  const { page, vault } = session;
  await ouvrirPage(page, 'Courses');
  const coller = (texte: string) =>
    editeur(page).evaluate((zone: { dispatchEvent(evenement: unknown): void }, contenu) => {
      const donnees = new DataTransfer();
      donnees.setData('text/plain', contenu);
      zone.dispatchEvent(new ClipboardEvent('paste', { clipboardData: donnees, bubbles: true, cancelable: true }));
    }, texte);

  // Une fin de page neuve : le curseur est dans un paragraphe vide.
  await editeur(page).locator('li', { hasText: 'Café' }).first().locator('p').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');

  await coller(markdown);
  const question = page.getByRole('dialog', { name: 'Texte Markdown collé' });
  await expect(question).toBeVisible();
  // Rien n'est collé avant la réponse.
  await expect(editeur(page).locator('h2')).toHaveCount(0);
  await question.getByRole('button', { name: 'Mettre en forme' }).click();
  await expect(editeur(page).locator('h2')).toHaveText('Plan');
  await expect(editeur(page).locator('li', { hasText: 'second point' }).last()).toBeVisible();

  // Garder en texte : le texte arrive tel quel, sans titre.
  await editeur(page).locator('h2').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await coller('# Autre titre\n\n* a\n* b');
  await page.getByRole('dialog', { name: 'Texte Markdown collé' }).getByRole('button', { name: 'Garder en texte' }).click();
  await expect(editeur(page).locator('h1')).toHaveCount(0);
  await attendreEnregistrement(page);
  expect(await lireCorps(vault, 'Courses')).toContain('# Autre titre');

  // Une phrase ordinaire se colle sans question.
  await coller('Juste une phrase.');
  await expect(page.getByRole('dialog', { name: 'Texte Markdown collé' })).toHaveCount(0);
  await fermer(session);
});
