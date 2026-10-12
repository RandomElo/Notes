import { execFile } from 'node:child_process';
import { appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { actionDePage, argumentsDeLancement, attendreEnregistrement, dossierApplication, editeur, fenetres, fermer, lancer, ligne, ouvrirPage, preparer, titreDePage } from './app';

// Types du DOM, évalués dans la fenêtre : le projet des essais n'a pas la bibliothèque DOM.
declare function getComputedStyle(element: unknown): { maskImage: string };

// Critère de J7 : sommaire toujours à jour. Plus les onglets. Les deux recherches (Ctrl+K, Ctrl+Alt+Espace) sont retirées
// depuis la 0.17.4 : la barre de recherche du poste les remplace, et ouvre une page par `--page=<id>`.

const onglets = (page: Page) => page.getByRole('tablist', { name: 'Onglets' }).getByRole('tab');
// Le titre seul, sans l'icône de la page (un emoji fait partie du texte de l'onglet).
const titresDesOnglets = (page: Page) => onglets(page).locator('span.truncate').allTextContents();
const ongletActif = (page: Page) => page.getByRole('tab', { selected: true }).locator('span.truncate');

test('onglets : une page par onglet, Ctrl+clic, Ctrl+W, Ctrl+Tab, Ctrl+1, retrouvés au redémarrage', async () => {
  const preparation = await preparer();
  let session = await lancer(preparation);
  let { page } = session;

  await ouvrirPage(page, 'Courses');
  expect(await titresDesOnglets(page)).toEqual(['Courses']);

  // Un clic remplace la page de l'onglet affiché.
  await ouvrirPage(page, 'Bienvenue');
  expect(await titresDesOnglets(page)).toEqual(['Bienvenue']);

  // Ctrl+clic : nouvel onglet juste après.
  await ligne(page, 'Courses').click({ modifiers: ['Control'] });
  await expect(titreDePage(page)).toHaveText('Courses');
  expect(await titresDesOnglets(page)).toEqual(['Bienvenue', 'Courses']);
  await expect(ongletActif(page)).toHaveText('Courses');

  // Une page déjà ouverte dans un onglet : on y retourne au lieu de l'ouvrir deux fois.
  await ligne(page, 'Bienvenue').click();
  await expect(ongletActif(page)).toHaveText('Bienvenue');
  expect(await titresDesOnglets(page)).toEqual(['Bienvenue', 'Courses']);

  await page.keyboard.press('Control+Tab');
  await expect(ongletActif(page)).toHaveText('Courses');
  await expect(titreDePage(page)).toHaveText('Courses');
  await page.keyboard.press('Control+1');
  await expect(ongletActif(page)).toHaveText('Bienvenue');

  // Clic du milieu dans l'arborescence : nouvel onglet aussi.
  await ligne(page, 'Projets').click({ button: 'middle' });
  await expect(ongletActif(page)).toHaveText('Projets');
  expect(await titresDesOnglets(page)).toEqual(['Bienvenue', 'Projets', 'Courses']);

  await page.keyboard.press('Control+w');
  expect(await titresDesOnglets(page)).toEqual(['Bienvenue', 'Courses']);
  await expect(ongletActif(page)).toHaveText('Courses');

  // Au redémarrage : mêmes onglets, même onglet affiché.
  await fermer(session);
  session = await lancer(preparation);
  page = session.page;
  await expect(ongletActif(page)).toHaveText('Courses');
  expect(await titresDesOnglets(page)).toEqual(['Bienvenue', 'Courses']);
  await expect(titreDePage(page)).toHaveText('Courses');

  // Fermer le dernier onglet le vide sans fermer la fenêtre.
  await page.keyboard.press('Control+w');
  await page.keyboard.press('Control+w');
  expect(await titresDesOnglets(page)).toEqual(['Nouvel onglet']);
  await expect(page.getByText("Choisis une page dans l'arborescence")).toBeVisible();
  await fermer(session);
});

const refonteDuNas = '0199a0b0-0000-7000-8000-000000000003';
const courses = '0199a0b0-0000-7000-8000-000000000005';

test('--page=<id> : la barre de recherche du poste ouvre une page, Notes lancée ou non ; plus de recherche dans Notes ; fermer quitte', async () => {
  const preparation = await preparer();
  // Notes pas lancée : elle s'ouvre sur la page demandée.
  const session = await lancer(preparation, [`--page=${refonteDuNas}`]);
  const { application, page } = session;
  await expect(titreDePage(page)).toHaveText('Refonte du NAS');

  // Ctrl+K ne fait plus rien ; Ctrl+T ouvre un onglet vide, sans recherche.
  await page.keyboard.press('Control+k');
  await page.keyboard.press('Control+t');
  await expect(ongletActif(page)).toHaveText('Nouvel onglet');
  await expect(page.getByRole('combobox')).toHaveCount(0);

  // Notes lancée : la seconde instance passe la page à la fenêtre ouverte, dans l'onglet affiché.
  const executable = await application.evaluate(() => process.execPath);
  execFile(executable, argumentsDeLancement(preparation.profil, [`--page=${courses}`]), { cwd: dossierApplication });
  await expect(titreDePage(page)).toHaveText('Courses');
  expect(await titresDesOnglets(page)).toEqual(['Refonte du NAS', 'Courses']);
  expect(await fenetres(application)).toEqual([{ titre: 'Notes', visible: true }]);

  // Fermer la fenêtre quitte Notes.
  await fermer(session);
});

test('sommaire : à jour à la frappe, suit la lecture, sommaire complet avec filtre', async () => {
  const session = await lancer(await preparer());
  const { page } = session;
  await page.setViewportSize({ width: 1100, height: 500 });
  await ouvrirPage(page, 'Bienvenue');
  const sommaire = page.getByRole('navigation', { name: 'Sommaire' });
  // Le latéral montre les trois premiers niveaux.
  await expect(sommaire.getByRole('button')).toHaveText(['Bienvenue dans Notes', 'Mise en forme', 'Listes', 'Citation et séparateur', 'Code et tableau']);

  // Un titre ajouté apparaît tout de suite.
  await editeur(page).locator('h2', { hasText: 'Mise en forme' }).click();
  await page.waitForTimeout(100);
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('## Nouveau chapitre', { delay: 15 });
  await expect(sommaire.getByRole('button')).toHaveText(['Bienvenue dans Notes', 'Mise en forme', 'Nouveau chapitre', 'Listes', 'Citation et séparateur', 'Code et tableau']);
  await attendreEnregistrement(page);

  // Le titre où en est la lecture est marqué ; il change quand la page défile.
  await page.locator('main').evaluate((zone) => zone.scrollTo(0, 0));
  await expect(sommaire.locator('[aria-current="location"]')).toHaveText('Bienvenue dans Notes');
  // En bas de la page : le dernier titre, de niveau 5, montré lui aussi.
  await page.locator('main').evaluate((zone) => zone.scrollTo(0, zone.scrollHeight));
  await expect(sommaire.locator('[aria-current="location"]')).toHaveText('Code et tableau');

  // Un clic dans le sommaire emmène au titre.
  await sommaire.hover();
  await sommaire.getByRole('button', { name: 'Mise en forme' }).click();
  await expect(sommaire.locator('[aria-current="location"]')).toHaveText('Mise en forme');

  // Sommaire complet : tous les niveaux, filtre sans accents, Entrée y va.
  await actionDePage(page, 'Sommaire de la page');
  const complet = page.getByRole('dialog', { name: 'Sommaire de la page' });
  await expect(complet.getByRole('heading', { name: 'Sommaire' })).toBeVisible();
  await expect(complet).toContainText('Bienvenue');
  await expect(complet.getByRole('option')).toHaveCount(6);
  await expect(complet.getByRole('option', { selected: true })).toHaveText('Mise en forme');
  await page.keyboard.type('separateur', { delay: 15 });
  await expect(complet.getByRole('option', { disabled: false })).toHaveText(['Citation et séparateur']);
  await page.keyboard.press('Enter');
  await expect(complet).toBeHidden();
  await expect(sommaire.locator('[aria-current="location"]')).toHaveText('Citation et séparateur');

  // Ctrl+Maj+\ masque le sommaire latéral, Ctrl+\ la barre latérale.
  await page.keyboard.press('Control+Shift+Backslash');
  await expect(sommaire).toBeHidden();
  await page.keyboard.press('Control+Backslash');
  await expect(page.getByRole('navigation', { name: 'Arborescence des pages' })).toBeHidden();
  await page.keyboard.press('Control+Backslash');
  await page.keyboard.press('Control+Shift+Backslash');
  await expect(sommaire).toBeVisible();
  await fermer(session);
});

test('sommaire : beaucoup de titres, hauteur limitée, le trait en cours reste visible et aligné avec son nom', async () => {
  const preparation = await preparer();
  const chapitres = Array.from({ length: 80 }, (_, rang) => `## Chapitre ${rang + 1}\n\nTexte du chapitre ${rang + 1}.\n`).join('\n');
  await appendFile(join(preparation.vault, 'Bienvenue', 'page.md'), `\n${chapitres}`);
  const session = await lancer(preparation);
  const { page } = session;
  await page.setViewportSize({ width: 1100, height: 700 });
  await ouvrirPage(page, 'Bienvenue');
  const sommaire = page.getByRole('navigation', { name: 'Sommaire' });
  const traits = sommaire.locator('div[aria-hidden]');
  const allume = traits.locator('[data-allume]');
  const boite = async (element: ReturnType<Page['locator']>) => (await element.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };

  // Les traits ne prennent pas toute la hauteur : 60 % de la fenêtre au plus. Trop nombreux, ils ne se tassent pas.
  expect((await boite(traits)).height).toBeLessThanOrEqual(700 * 0.6 + 1);
  expect((await boite(traits.locator('span').first())).height).toBeGreaterThan(1);

  // Dégradé seulement du côté où des traits sont cachés : aucun tout en haut de la page.
  // Le masque commence transparent si le haut s'estompe, finit transparent si le bas s'estompe.
  const estompage = () =>
    traits.evaluate((element) => {
      const masque = getComputedStyle(element).maskImage;
      const haut = masque.startsWith('linear-gradient(rgba(0, 0, 0, 0)');
      const bas = masque.endsWith('rgba(0, 0, 0, 0))');
      return haut && bas ? 'les deux' : haut ? 'haut' : bas ? 'bas' : 'aucun';
    });
  await expect.poll(estompage).toBe('bas');

  // Au milieu puis en bas de la page, le trait allumé reste dans la partie visible des traits.
  for (const [chapitre, attendu] of [['Chapitre 40', 'les deux'], ['Chapitre 80', 'haut']] as const) {
    await editeur(page).locator('h2', { hasText: new RegExp(`^${chapitre}$`) }).evaluate((titre) => titre.scrollIntoView({ block: 'start' }));
    await expect(sommaire.locator('li[data-allume]')).toHaveText(chapitre);
    await expect
      .poll(async () => {
        const [cadre, trait] = [await boite(traits), await boite(allume)];
        return trait.y >= cadre.y && trait.y + trait.height <= cadre.y + cadre.height;
      })
      .toBe(true);
    await expect.poll(estompage).toBe(attendu);
  }

  // Au survol, le nom du titre en cours s'affiche à la hauteur de son trait.
  await editeur(page).locator('h2', { hasText: /^Chapitre 20$/ }).evaluate((titre) => titre.scrollIntoView({ block: 'start' }));
  await expect(sommaire.locator('li[data-allume]')).toHaveText('Chapitre 20');
  await page.waitForTimeout(500);
  const trait = await boite(allume);
  await sommaire.hover();
  const nom = sommaire.locator('li[data-allume]');
  await expect.poll(async () => Math.abs((await boite(nom)).y + (await boite(nom)).height / 2 - (trait.y + trait.height / 2))).toBeLessThan(16);
  await fermer(session);
});
