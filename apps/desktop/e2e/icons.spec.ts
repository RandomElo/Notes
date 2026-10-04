import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { fermer, lancer, ligne, ouvrirPage, preparer } from './app';

// Ce que les fonctions passées à evaluate utilisent du DOM, que la configuration TypeScript des essais ne connaît pas.
declare const OffscreenCanvas: new (
  largeur: number,
  hauteur: number,
) => {
  getContext(type: '2d'): { fillStyle: string; fillRect(...n: number[]): void; beginPath(): void; arc(...n: number[]): void; fill(): void };
  convertToBlob(options: { type: string }): Promise<Blob>;
};
declare function createImageBitmap(blob: Blob): Promise<{ width: number; height: number }>;

// J8 : icônes de page (emoji cherché en français, icône Lucide par un mot français, image recadrée et détourée).

const enTete = async (vault: string, page: string): Promise<string> => (await readFile(join(vault, page, 'page.md'), 'utf8')).split('\n---\n')[0] ?? '';
const choix = (page: Page) => page.getByRole('dialog', { name: 'Icône de la page' });

test('emoji depuis le haut de la page, icône Lucide depuis l’arborescence, puis retrait', async () => {
  const session = await lancer(await preparer());
  const { page, vault } = session;

  // Sans icône, « Ajouter une icône » apparaît au survol du haut de la page.
  await ouvrirPage(page, 'Courses');
  await page.getByRole('textbox', { name: 'Titre de la page' }).hover();
  await page.getByRole('button', { name: 'Ajouter une icône' }).click();
  await page.keyboard.type('fusee', { delay: 15 });
  await expect(choix(page).getByRole('option').first()).toHaveAttribute('aria-label', /fusée/);
  await page.keyboard.press('Enter');
  await expect(choix(page)).toHaveCount(0);
  await expect.poll(() => enTete(vault, 'Courses')).toContain('icon: 🚀');
  await expect(page.getByRole('button', { name: "Changer l'icône de la page" })).toHaveText('🚀');
  await expect(ligne(page, 'Courses')).toContainText('🚀');
  await expect(page.getByRole('tab', { selected: true })).toContainText('🚀');

  // Menu de l'arborescence : une icône Lucide trouvée par un mot français.
  await ligne(page, 'Projets').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Icône' }).click();
  await choix(page).getByRole('tab', { name: 'Icônes' }).click();
  await page.keyboard.type('maison', { delay: 15 });
  await choix(page).getByRole('option', { name: 'house', exact: true }).click();
  await expect.poll(() => enTete(vault, 'Projets')).toContain('icon: house');
  await expect(ligne(page, 'Projets').locator('svg.lucide-house')).toBeVisible();

  // Retirer : la clé disparaît du front-matter, le reste ne bouge pas.
  await page.getByRole('button', { name: "Changer l'icône de la page" }).click();
  await choix(page).getByRole('button', { name: 'Retirer' }).click();
  await expect.poll(() => enTete(vault, 'Courses')).not.toContain('icon:');
  expect(await enTete(vault, 'Courses')).toContain('title: Courses');

  await fermer(session);
});

test('icône image : recadrée en 128 × 128, fond retiré par le modèle local', async () => {
  const preparation = await preparer();
  const session = await lancer(preparation);
  const { page, vault, application } = session;

  // Une image de 300 × 200 : un disque rouge sur fond blanc, posée là où le sélecteur de fichiers la « trouve ».
  const octets = await page.evaluate(async () => {
    const toile = new OffscreenCanvas(300, 200);
    const contexte = toile.getContext('2d');
    contexte.fillStyle = '#ffffff';
    contexte.fillRect(0, 0, 300, 200);
    contexte.fillStyle = '#d42020';
    contexte.beginPath();
    contexte.arc(150, 100, 60, 0, Math.PI * 2);
    contexte.fill();
    return [...new Uint8Array(await (await toile.convertToBlob({ type: 'image/png' })).arrayBuffer())];
  });
  const fichier = join(preparation.profil, 'disque.png');
  await writeFile(fichier, new Uint8Array(octets));
  await application.evaluate(({ dialog }, chemin) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [chemin] })) as typeof dialog.showOpenDialog;
  }, fichier);

  await ouvrirPage(page, 'Courses');
  await page.getByRole('textbox', { name: 'Titre de la page' }).hover();
  await page.getByRole('button', { name: 'Ajouter une icône' }).click();
  await choix(page).getByRole('tab', { name: 'Image' }).click();
  await choix(page).getByRole('button', { name: 'Choisir une image' }).click();
  await choix(page).getByRole('button', { name: 'Retirer le fond' }).click();
  // Le modèle tourne dans le main : quelques secondes au premier appel.
  await expect(choix(page).getByRole('button', { name: 'Garder le fond' })).toBeVisible({ timeout: 30_000 });
  await choix(page).getByRole('button', { name: 'Valider' }).click();

  await expect.poll(() => enTete(vault, 'Courses')).toContain('icon: assets/icone.webp');
  const icone = await readFile(join(vault, 'Courses', 'assets', 'icone.webp'));
  expect(icone.subarray(8, 12).toString('latin1')).toBe('WEBP');
  // 128 × 128, et des coins transparents (le fond blanc retiré) : relu par le moteur d'images de la fenêtre.
  const lue = await page.evaluate(async (donnees) => {
    const image = await createImageBitmap(new Blob([new Uint8Array(donnees)], { type: 'image/webp' }));
    const toile = new OffscreenCanvas(image.width, image.height);
    const contexte = toile.getContext('2d') as unknown as { drawImage(image: unknown, x: number, y: number): void; getImageData(...n: number[]): { data: Uint8ClampedArray } };
    contexte.drawImage(image, 0, 0);
    return { largeur: image.width, hauteur: image.height, coin: contexte.getImageData(2, 2, 1, 1).data[3], centre: contexte.getImageData(64, 64, 1, 1).data[3] };
  }, [...icone]);
  expect(lue).toMatchObject({ largeur: 128, hauteur: 128 });
  expect(lue.coin).toBeLessThan(40);
  expect(lue.centre).toBeGreaterThan(200);
  await expect(page.getByRole('button', { name: "Changer l'icône de la page" }).locator('img')).toBeVisible();

  await fermer(session);
});

test('icône image depuis l’adresse d’une image', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');
  const serveur = createServer((_requete, reponse) => reponse.writeHead(200, { 'content-type': 'image/png' }).end(png));
  await new Promise<void>((pret) => serveur.listen(0, '127.0.0.1', pret));
  const session = await lancer(await preparer());
  const { page, vault } = session;
  await ouvrirPage(page, 'Courses');
  await page.getByRole('textbox', { name: 'Titre de la page' }).hover();
  await page.getByRole('button', { name: 'Ajouter une icône' }).click();
  await choix(page).getByRole('tab', { name: 'Image' }).click();
  await choix(page).getByLabel("Adresse d'une image").fill(`http://127.0.0.1:${(serveur.address() as AddressInfo).port}/logo.png`);
  await choix(page).getByRole('button', { name: 'Charger' }).click();
  await choix(page).getByRole('button', { name: 'Valider' }).click();
  await expect.poll(() => enTete(vault, 'Courses')).toContain('icon: assets/icone.webp');
  await fermer(session);
  serveur.close();
});
