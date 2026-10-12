import { expect, test } from '@playwright/test';
import { attendreEnregistrement, editeur, fermer, lancer, ouvrirPage, preparer } from './app';

// La sync elle-même se vérifie sans NAS dans packages/core (sync/*.test.ts) et sur le NAS réel par `npm run test:nas`.
// Ici, ce que l'application montre quand le NAS n'est pas réglé : rien n'est bloqué.

test('sans NAS réglé, la barre de statut le dit et la page reste modifiable', async () => {
  const session = await lancer(await preparer());
  const { page } = session;

  const etat = page.getByRole('button', { name: 'Connexion au NAS pas réglée' });
  await expect(etat).toBeVisible();

  await etat.click();
  const panneau = page.getByRole('dialog', { name: 'Synchronisation avec le NAS' });
  await expect(panneau).toContainText('La connexion au NAS se règle dans les réglages');
  await expect(panneau.getByRole('button', { name: 'Synchroniser' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(panneau).toHaveCount(0);
  await expect(etat).toBeFocused();

  // Pas de NAS, pas de verrou : on écrit comme avant.
  await ouvrirPage(page, 'Courses');
  await editeur(page).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' sans NAS', { delay: 15 });
  await attendreEnregistrement(page);
  await expect(page.getByText('en cours de modification sur')).toHaveCount(0);
  await expect(editeur(page)).toContainText('sans NAS');

  await fermer(session);
});
