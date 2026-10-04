import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { access, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { attendreEnregistrement, editeur, fermer, lancer, ligne, lireCorps, ouvrirPage, preparer, titreDePage } from './app';

// Ce que les fonctions passées à evaluate utilisent du DOM, que la configuration TypeScript des essais ne connaît pas.
declare const DataTransfer: new () => { setData(type: string, valeur: string): void };
declare const ClipboardEvent: new (type: string, options: { clipboardData: unknown; bubbles: boolean; cancelable: boolean }) => unknown;

// Critère de J8 : renommage sans mention cassée. Plus les liens externes.

const projets = '0199a0b0-0000-7000-8000-000000000002';
const refonte = '0199a0b0-0000-7000-8000-000000000003';
const taper = (page: Page, texte: string) => page.keyboard.type(texte, { delay: 15 });
const mention = (page: Page, titre: string) => editeur(page).locator('.mention', { hasText: titre });
const champDuNom = (page: Page) => page.getByRole('tree').getByRole('textbox', { name: 'Titre de la page' });

/** Colle du texte dans l'éditeur, comme Ctrl+V. */
async function coller(page: Page, texte: string): Promise<void> {
  await editeur(page).evaluate((zone: { dispatchEvent(evenement: unknown): void }, contenu) => {
    const donnees = new DataTransfer();
    donnees.setData('text/plain', contenu);
    zone.dispatchEvent(new ClipboardEvent('paste', { clipboardData: donnees, bubbles: true, cancelable: true }));
  }, texte);
}

/** Va à la fin de la page, dans un paragraphe neuf : deux Entrée sortent d'une liste. */
async function finDePage(page: Page): Promise<void> {
  await editeur(page).click();
  await page.waitForTimeout(100);
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
}

test('une page renommée : ses mentions suivent, dans la page ouverte comme dans les autres fichiers', async () => {
  const session = await lancer(await preparer());
  const { page, vault } = session;

  // « @ » ouvre la liste des pages, filtrée par ce qu'on tape, sans accents.
  await ouvrirPage(page, 'Courses');
  await finDePage(page);
  await taper(page, 'Voir @proj');
  const liste = page.getByRole('listbox', { name: 'Mentionner une page' });
  await expect(liste.getByRole('option').first()).toHaveText(/Projets/);
  await page.keyboard.press('Enter');
  await expect(liste).toHaveCount(0);
  await expect(mention(page, 'Projets')).toBeVisible();
  // « /lien » fait la même chose.
  await taper(page, 'et ');
  await taper(page, '/lien');
  await page.keyboard.press('Enter');
  await taper(page, 'refonte');
  await page.keyboard.press('Enter');
  await expect(mention(page, 'Refonte du NAS')).toBeVisible();
  await attendreEnregistrement(page);
  expect(await lireCorps(vault, 'Courses')).toContain(`Voir [Projets](notes://${projets}) et [Refonte du NAS](notes://${refonte})`);

  // Renommer « Refonte du NAS » depuis l'arborescence, Courses ouverte : l'éditeur suit, puis son fichier.
  await ligne(page, 'Projets').locator('button[aria-label="Déplier"]').click();
  await ligne(page, 'Refonte du NAS').focus();
  await page.keyboard.press('F2');
  await champDuNom(page).fill('Chantier NAS');
  await page.keyboard.press('Enter');
  await expect(ligne(page, 'Chantier NAS')).toBeVisible();
  await expect(mention(page, 'Chantier NAS')).toBeVisible();
  await attendreEnregistrement(page);
  await expect.poll(() => lireCorps(vault, 'Courses')).toContain(`[Chantier NAS](notes://${refonte})`);
  // La page Bienvenue, fermée, mentionnait aussi Refonte du NAS : son fichier est réécrit par le main, et seulement la ligne de la mention.
  const bienvenue = await lireCorps(vault, 'Bienvenue');
  expect(bienvenue).toContain(`[Chantier NAS](notes://${refonte})`);
  expect(bienvenue).toContain('Un [lien externe](https://example.com) et un lien vers');

  // Le titre de la page ouverte se renomme aussi : les mentions des autres pages suivent.
  await ouvrirPage(page, 'Projets');
  await titreDePage(page).click();
  await page.keyboard.press('Control+A');
  await taper(page, 'Mes projets');
  await page.keyboard.press('Enter');
  await expect(ligne(page, 'Mes projets')).toBeVisible();
  await expect.poll(() => lireCorps(vault, 'Courses')).toContain(`Voir [Mes projets](notes://${projets})`);

  // Un clic sur une mention ouvre la page ; Ctrl+clic dans un nouvel onglet.
  await ouvrirPage(page, 'Courses');
  await mention(page, 'Chantier NAS').click();
  await expect(titreDePage(page)).toHaveText('Chantier NAS');
  await ouvrirPage(page, 'Courses');
  await mention(page, 'Mes projets').click({ modifiers: ['Control'] });
  await expect(titreDePage(page)).toHaveText('Mes projets');
  await expect(page.getByRole('tablist', { name: 'Onglets' }).getByRole('tab')).toHaveCount(2);

  // Aucune mention cassée après tout ça.
  await page.keyboard.press('Control+,');
  await page.locator('section[aria-labelledby="titre-mentions"]').getByRole('button', { name: 'Chercher' }).click();
  await expect(page.getByText('Aucune mention cassée.')).toBeVisible();

  await fermer(session);
});

test('mention cassée : barrée dans la page, listée dans les réglages', async () => {
  const preparation = await preparer();
  // Un lien vers une page qui n'existe pas, écrit par un autre outil.
  const fichier = join(preparation.vault, 'Courses', 'page.md');
  const absente = '0199a0b0-0000-7000-8000-0000000000ff';
  await writeFile(fichier, `${await readFile(fichier, 'utf8')}\nUne page perdue : [Archives](notes://${absente})\n`);
  const session = await lancer(preparation);
  const { page } = session;
  await ouvrirPage(page, 'Courses');
  const cassee = editeur(page).locator('.mention[data-cassee]');
  await expect(cassee).toHaveText('Archives');
  await expect(cassee.locator('.mention-titre')).toHaveCSS('text-decoration-line', 'line-through');

  await page.keyboard.press('Control+,');
  await page.locator('section[aria-labelledby="titre-mentions"]').getByRole('button', { name: 'Chercher' }).click();
  await expect(page.getByText('Une mention cassée.')).toBeVisible();
  await expect(page.getByText('dans Courses')).toBeVisible();
  await page.getByRole('button', { name: 'Ouvrir la page' }).click();
  await expect(titreDePage(page)).toHaveText('Courses');

  await fermer(session);
});

test('liens externes : collage, infobulle, modification, ouverture dans le navigateur', async () => {
  const session = await lancer(await preparer());
  const { page, vault, application } = session;
  await application.evaluate(({ shell }) => {
    const ouverts: string[] = [];
    (globalThis as unknown as { ouverts: string[] }).ouverts = ouverts;
    shell.openExternal = async (adresse: string) => {
      ouverts.push(adresse);
    };
  });
  const ouverts = () => application.evaluate(() => (globalThis as unknown as { ouverts: string[] }).ouverts);

  // Une page neuve, à la racine : on tape son nom, puis on écrit dedans.
  await page.keyboard.press('Control+Shift+N');
  await champDuNom(page).fill('Liens');
  await page.keyboard.press('Enter');
  await expect(titreDePage(page)).toHaveText('Liens');
  await editeur(page).click();
  await page.waitForTimeout(100);
  // Une adresse collée seule : un lien au texte nettoyé.
  await taper(page, 'Moteur : ');
  await coller(page, 'https://www.example.invalid/');
  await taper(page, ' fin');
  await page.keyboard.press('Enter');
  // Une adresse collée sur une sélection : la sélection devient le lien.
  await taper(page, 'la doc ici');
  // Juste après la frappe, Maj+← va trop vite pour l'éditeur dans Playwright : une courte attente.
  await page.waitForTimeout(150);
  await page.keyboard.down('Shift');
  for (let fois = 0; fois < 3; fois++) {
    await page.keyboard.press('ArrowLeft', { delay: 15 });
    await page.waitForTimeout(30);
  }
  await page.keyboard.up('Shift');
  await coller(page, 'https://example.org/doc');
  await attendreEnregistrement(page);
  const corps = await lireCorps(vault, 'Liens');
  expect(corps).toContain('Moteur : [example.invalid](https://www.example.invalid/) fin');
  expect(corps).toContain('la doc [ici](https://example.org/doc)');

  // Un clic ouvre le lien dans le navigateur. (Une touche ferme d'abord la barre d'outils de la sélection.)
  await page.keyboard.press('End');
  await editeur(page).locator('a', { hasText: 'example.invalid' }).click();
  await expect.poll(ouverts).toEqual(['https://www.example.invalid/']);

  // Au survol, l'infobulle. La souris y va lentement sans qu'elle se ferme : « Modifier » change le texte et l'adresse.
  await editeur(page).locator('a', { hasText: 'ici' }).hover();
  const bulle = page.getByRole('toolbar', { name: 'Lien' });
  await expect(bulle).toContainText('https://example.org/doc');
  const cible = await bulle.getByRole('button', { name: 'Modifier' }).boundingBox();
  if (cible === null) {
    throw new Error('bouton introuvable');
  }
  await page.mouse.move(cible.x + cible.width / 2, cible.y + cible.height / 2, { steps: 30 });
  await page.waitForTimeout(600);
  await expect(bulle).toBeVisible();
  await bulle.getByRole('button', { name: 'Modifier' }).click();
  const formulaire = page.getByRole('dialog', { name: 'Modifier le lien' });
  await formulaire.getByLabel('Texte').fill('cette page');
  await formulaire.getByLabel('Adresse').fill('example.net');
  await page.keyboard.press('Enter');
  await attendreEnregistrement(page);
  expect(await lireCorps(vault, 'Liens')).toContain('la doc [cette page](https://example.net)');

  // « Retirer le lien » garde le texte.
  await editeur(page).locator('a', { hasText: 'cette page' }).hover();
  await bulle.getByRole('button', { name: 'Retirer le lien' }).click();
  await attendreEnregistrement(page);
  expect(await lireCorps(vault, 'Liens')).toContain('la doc cette page');

  // Le bouton « Lien » de la barre d'outils pose un lien sur la sélection.
  await editeur(page).getByText('la doc cette page').click();
  await page.waitForTimeout(100);
  await page.keyboard.press('End');
  await page.waitForTimeout(150);
  await page.keyboard.down('Shift');
  for (let fois = 0; fois < 4; fois++) {
    await page.keyboard.press('ArrowLeft', { delay: 15 });
    await page.waitForTimeout(30);
  }
  await page.keyboard.up('Shift');
  await page.getByRole('toolbar', { name: 'Mise en forme' }).getByRole('button', { name: 'Lien' }).click();
  await formulaire.getByLabel('Adresse').fill('https://example.com/page');
  await page.keyboard.press('Enter');
  await attendreEnregistrement(page);
  expect(await lireCorps(vault, 'Liens')).toContain('la doc cette [page](https://example.com/page)');

  await fermer(session);
});

test('mention de site : une adresse collée prend la favicon et le titre du site, et revient en lien', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');
  const serveur = createServer((requete, reponse) => {
    if (requete.url === '/favicon.png') {
      reponse.writeHead(200, { 'content-type': 'image/png' }).end(png);
      return;
    }
    reponse.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end('<html><head><title>Le site d’essai</title><link rel="icon" href="/favicon.png"></head></html>');
  });
  await new Promise<void>((pret) => serveur.listen(0, '127.0.0.1', pret));
  const adresse = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}/`;
  const session = await lancer(await preparer());
  const { page, vault } = session;

  await ouvrirPage(page, 'Courses');
  await finDePage(page);
  await taper(page, 'Voir ');
  await coller(page, adresse);
  const puce = editeur(page).locator('a.mention-site');
  await expect(puce).toHaveText('Le site d’essai');
  await expect(puce.locator('.mention-site-icone img')).toHaveJSProperty('naturalWidth', 64);
  await attendreEnregistrement(page);
  expect(await lireCorps(vault, 'Courses')).toContain(`Voir [Le site d’essai](${adresse} "mention")`);
  await access(join(vault, '.notes', 'favicons', '127.0.0.1.png'));

  // L'infobulle la ramène à un simple lien.
  await puce.hover();
  await page.getByRole('toolbar', { name: 'Lien' }).getByRole('button', { name: 'En lien' }).click();
  await attendreEnregistrement(page);
  expect(await lireCorps(vault, 'Courses')).toContain(`Voir [127.0.0.1:${(serveur.address() as AddressInfo).port}](${adresse})`);

  await fermer(session);
  serveur.close();
});
