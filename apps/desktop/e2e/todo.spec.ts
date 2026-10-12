import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { actionDePage, attendreEnregistrement, editeur, fermer, lancer, lireCorps, ouvrirPage, preparer } from './app';

// Mode liste de tâches (J14, docs/spec/liste-de-taches.md) : une seule liste par page, sans titres, façon Keep.

const enTeteProjets = '---\nid: 0199a0b0-0000-7000-8000-000000000002\ntitle: Projets\ncreated: 2026-10-01T08:00:00.000Z\nupdated: 2026-10-01T08:00:00.000Z\n---\n';

test('passer une page en mode liste en fait une seule liste, prête à écrire ; la quitter garde les tâches', async () => {
  const preparation = await preparer();
  await writeFile(join(preparation.vault, 'Projets', 'page.md'), `${enTeteProjets}Appeler le plombier\n\n- [ ] Refaire le site\n- [x] Ranger le NAS\n\n# Plus tard\n\n\`\`\`sh\nls\n\`\`\`\n`);
  const session = await lancer(preparation);
  const { page, vault } = session;
  await ouvrirPage(page, 'Projets');
  await actionDePage(page, 'Passer en liste de tâches');
  await expect(editeur(page)).toBeFocused();
  // Pas de champ d'ajout : le curseur est dans une tâche vide, avant « Terminé ».
  await expect(page.getByRole('textbox', { name: 'Ajouter une tâche' })).toHaveCount(0);
  await page.keyboard.type('Lait', { delay: 15 });
  await attendreEnregistrement(page);
  await expect
    .poll(() => lireCorps(vault, 'Projets'))
    .toBe('- [ ] Appeler le plombier\n- [ ] Refaire le site\n- [ ] Plus tard\n  ```sh\n  ls\n  ```\n- [ ] Lait\n- [x] Ranger le NAS\n');
  expect(await readFile(join(vault, 'Projets', 'page.md'), 'utf8')).toContain('\nmode: todo\n');
  // Le menu « ⋮ » propose maintenant de quitter le mode ; Échap le ferme et rend le focus à son bouton.
  await page.getByRole('button', { name: 'Actions de la page' }).click();
  await expect(page.getByRole('menuitem', { name: 'Sommaire de la page' })).toBeFocused();
  await expect(page.getByRole('menuitem')).toHaveText(['Sommaire de la page', 'Quitter le mode liste', 'Fonctions IA', 'Exporter la page']);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Actions de la page' })).toBeFocused();
  await editeur(page).locator('li', { hasText: 'Lait' }).locator('p').click();
  await page.waitForTimeout(100);
  await page.keyboard.press('End');
  await expect(editeur(page).locator('h1, h2, h3')).toHaveCount(0);

  // Quitter le mode par le menu « / » : le contenu ne change pas.
  await page.keyboard.press('Enter');
  await page.keyboard.type('/quitter', { delay: 15 });
  await page.getByRole('option', { name: 'Quitter le mode liste' }).click();
  await expect.poll(async () => readFile(join(vault, 'Projets', 'page.md'), 'utf8')).not.toContain('mode:');
  expect(await lireCorps(vault, 'Projets')).toContain('- [ ] Lait\n- [x] Ranger le NAS\n');
  await fermer(session);
});

test('cocher range dans « Terminé », repliable ; Entrée et clic sous la liste ouvrent une tâche, laissée vide elle disparaît', async () => {
  const session = await lancer(await preparer());
  const { page, vault } = session;
  await ouvrirPage(page, 'Courses');
  const contenu = editeur(page);
  const taches = contenu.locator('ul[data-type="taskList"] > li[data-checked]');
  await expect(page.getByRole('button', { name: /Terminé \(1\)/ })).toBeVisible();

  // Cocher « Pâtes » : elle passe en tête de « Terminé », dans le fichier aussi.
  await taches.filter({ hasText: 'Pâtes' }).locator('input[type="checkbox"]').click();
  await expect(page.getByRole('button', { name: /Terminé \(2\)/ })).toBeVisible();
  await attendreEnregistrement(page);
  await expect.poll(() => lireCorps(vault, 'Courses')).toBe('- [ ] Tomates\n- [x] Pâtes\n- [x] Café\n');

  // Replier cache les tâches faites, sans toucher au fichier.
  await page.getByRole('button', { name: /Terminé \(2\)/ }).click();
  await expect(taches.filter({ hasText: 'Café' })).toBeHidden();
  await page.getByRole('button', { name: /Terminé \(2\)/ }).click();
  await expect(taches.filter({ hasText: 'Café' })).toBeVisible();

  // Décocher « Café » : elle revient après les tâches à faire.
  await taches.filter({ hasText: 'Café' }).locator('input[type="checkbox"]').click();
  await attendreEnregistrement(page);
  await expect.poll(() => lireCorps(vault, 'Courses')).toBe('- [ ] Tomates\n- [ ] Café\n- [x] Pâtes\n');

  // Entrée à la fin d'une tâche donne la suivante ; Entrée sur une tâche vide ne fait rien ; « # » ne fait pas de titre.
  await taches.filter({ hasText: 'Tomates' }).locator('p').click();
  await page.waitForTimeout(100);
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('# Sel', { delay: 15 });
  await attendreEnregistrement(page);
  await expect.poll(() => lireCorps(vault, 'Courses')).toBe('- [ ] Tomates\n- [ ] \\# Sel\n- [ ] Café\n- [x] Pâtes\n');
  await expect(contenu.locator('h1')).toHaveCount(0);

  // Un clic sous la liste ouvre une tâche vide avant « Terminé » ; quittée sans rien écrire, elle disparaît.
  // Juste sous la dernière tâche, dans le vide de l'éditeur.
  const derniere = (await taches.last().boundingBox())!;
  await page.mouse.click(derniere.x + 100, derniere.y + derniere.height + 30);
  await page.waitForTimeout(150);
  await expect(taches).toHaveCount(5);
  await expect(taches.nth(3).locator('p')).toHaveText('');
  await taches.filter({ hasText: 'Café' }).locator('p').click();
  await expect(taches).toHaveCount(4);
  await page.waitForTimeout(1200);
  expect(await lireCorps(vault, 'Courses')).toBe('- [ ] Tomates\n- [ ] \\# Sel\n- [ ] Café\n- [x] Pâtes\n');

  await fermer(session);
});

test('un bloc choisi dans le menu se range sous la tâche', async () => {
  const preparation = await preparer();
  await writeFile(join(preparation.vault, 'Projets', 'page.md'), `${enTeteProjets.replace(/---\n$/, 'mode: todo\n---\n')}- [ ] Installer le serveur\n`);
  const session = await lancer(preparation);
  const { page, vault } = session;
  await ouvrirPage(page, 'Projets');
  await editeur(page).locator('p', { hasText: 'Installer le serveur' }).click();
  await page.waitForTimeout(100);
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/code', { delay: 15 });
  // Ni titres ni listes dans le menu d'une page en liste.
  await expect(page.getByRole('option', { name: 'Titre 1' })).toHaveCount(0);
  await page.keyboard.press('Enter');
  await page.keyboard.type('apt install nginx', { delay: 15 });
  await attendreEnregistrement(page);
  await expect.poll(() => lireCorps(vault, 'Projets')).toBe('- [ ] Installer le serveur\n  ```\n  apt install nginx\n  ```\n');
  await fermer(session);
});

test('une page vide passée en liste montre sa case, sans rien écrire dans le fichier avant la frappe', async () => {
  const preparation = await preparer();
  await writeFile(join(preparation.vault, 'Projets', 'page.md'), enTeteProjets);
  const session = await lancer(preparation);
  const { page, vault } = session;
  await ouvrirPage(page, 'Projets');
  await actionDePage(page, 'Passer en liste de tâches');
  await expect(editeur(page).locator('p.tache-a-venir')).toHaveCount(1);
  await page.waitForTimeout(1200);
  expect(await lireCorps(vault, 'Projets')).toBe('');
  await page.keyboard.type('Pain', { delay: 15 });
  await attendreEnregistrement(page);
  await expect.poll(() => lireCorps(vault, 'Projets')).toBe('- [ ] Pain\n');
  await expect(editeur(page).locator('p.tache-a-venir')).toHaveCount(0);
  await fermer(session);
});
