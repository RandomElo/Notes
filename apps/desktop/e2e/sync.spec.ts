import { stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { attendreEnregistrement, editeur, fermer, lancer, ouvrirPage, preparer } from './app';

// Types du DOM, évalués dans la fenêtre : le projet des essais n'a pas la bibliothèque DOM.
declare const window: { notes: { lireConflitDOrdre(demande: { sauvegarde: string }): Promise<unknown>; ecarterConflitDOrdre(demande: { sauvegarde: string }): Promise<unknown> } };

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

test('un ordre de sous-pages en conflit : la différence se lit, « Garder l’ordre actuel » écarte la sauvegarde', async () => {
  // Le détail de la sync ne liste les sauvegardes qu'après un cycle avec le NAS : ici, les canaux qu'il appelle.
  const preparation = await preparer();
  const sauvegarde = join(preparation.vault, 'Projets', '.order.conflit-2026-10-03-190212');
  // L'ancien ordre : les deux pages inversées, plus une page qui n'existe plus.
  await writeFile(sauvegarde, '0199a0b0-0000-7000-8000-000000000003\n0199a0b0-0000-7000-8000-000000000004\n0199a0b0-0000-7000-8000-0000000000ff\n');
  const session = await lancer(preparation);
  const { page } = session;
  const conflit = await page.evaluate(() =>
    window.notes.lireConflitDOrdre({ sauvegarde: 'Projets/.order.conflit-2026-10-03-190212' }),
  );
  expect(conflit).toMatchObject({
    ok: true,
    actuel: [
      { titre: 'Site perso', difference: 'deplacee' },
      { titre: 'Refonte du NAS', difference: 'deplacee' },
    ],
    ancien: [
      { titre: 'Refonte du NAS', difference: 'deplacee' },
      { titre: 'Site perso', difference: 'deplacee' },
      { titre: null, difference: 'seule' },
    ],
  });
  await page.evaluate(() =>
    window.notes.ecarterConflitDOrdre({ sauvegarde: 'Projets/.order.conflit-2026-10-03-190212' }),
  );
  await expect.poll(() => stat(sauvegarde).then(() => true, () => false)).toBe(false);
  await fermer(session);
});
