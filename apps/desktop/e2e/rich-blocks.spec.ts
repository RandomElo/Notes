import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { attendreEnregistrement, editeur, fermer, lancer, lireCorps, ouvrirPage, preparer } from './app';

// Ce que les fonctions passées à evaluate utilisent du DOM, que la configuration TypeScript des essais ne connaît pas.
declare const DataTransfer: new () => { items: { add(fichier: unknown): void } };
declare const OffscreenCanvas: new (largeur: number, hauteur: number) => { getContext(type: '2d'): unknown; convertToBlob(options: { type: string }): Promise<Blob> };
declare const ClipboardEvent: new (type: string, options: { clipboardData: unknown; bubbles: boolean; cancelable: boolean }) => unknown;
declare const navigator: { clipboard: { readText(): Promise<string> } };
declare function getComputedStyle(element: unknown): { cursor: string };

// Critère de sortie de J6 : une page technique complète, rédigée confortablement (code, tableau, callout, image).

const taper = (page: Page, texte: string) => page.keyboard.type(texte, { delay: 15 });
const touche = async (page: Page, ...touches: string[]) => {
  for (const nom of touches) {
    await page.keyboard.press(nom, { delay: 15 });
  }
};

/** Un PNG de 1 × 1 pixel. */
const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 248, 207, 192, 240, 31, 0, 5, 0, 1, 255, 137, 153, 61, 29, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130];

/** Colle une image dans l'éditeur, comme une capture d'écran. */
async function collerImage(page: Page): Promise<void> {
  await editeur(page).evaluate((zone: { dispatchEvent(evenement: unknown): void }, octets) => {
    const donnees = new DataTransfer();
    donnees.items.add(new File([new Uint8Array(octets)], 'image.png', { type: 'image/png' }));
    zone.dispatchEvent(new ClipboardEvent('paste', { clipboardData: donnees, bubbles: true, cancelable: true }));
  }, png);
}

test('une page technique se rédige avec code, tableau, callout et image', async () => {
  const session = await lancer(await preparer());
  const { page, vault } = session;
  await ouvrirPage(page, 'Projets');
  await editeur(page).click();

  // Bloc de code : le langage se choisit dans la liste, la coloration suit.
  await taper(page, '/code');
  await touche(page, 'Enter');
  await taper(page, 'const reponse: number = 42;');
  await page.getByRole('button', { name: 'Texte brut' }).click();
  await taper(page, 'typesc');
  await touche(page, 'Enter');
  await expect(page.getByRole('button', { name: 'TypeScript' })).toBeVisible();
  // Le premier caractère d'une ligne porte son numéro : un mot-clé peut être coupé en deux morceaux colorés.
  await expect.poll(() => editeur(page).locator('pre .hljs-keyword').allTextContents().then((morceaux) => morceaux.join(''))).toBe('const');

  // Sortie du bloc de code par trois Entrée, puis un tableau de 2 × 2 choisi dans la grille.
  await editeur(page).locator('pre').click();
  await touche(page, 'End', 'Enter', 'Enter', 'Enter');
  await taper(page, '/tableau');
  await touche(page, 'Enter');
  const grille = page.getByRole('dialog', { name: /Taille du tableau/ });
  await expect(grille).toBeVisible();
  await touche(page, 'ArrowLeft', 'ArrowUp', 'Enter');
  await expect(grille).toBeHidden();
  await taper(page, 'Langage');
  await touche(page, 'Tab');
  await taper(page, 'Année');
  await touche(page, 'Tab');
  await taper(page, 'Go');
  await touche(page, 'Tab');
  await taper(page, '2009');
  // Entrée sous la dernière ligne en ajoute une.
  await touche(page, 'Enter');
  await taper(page, '2015');
  await touche(page, 'Shift+Tab');
  await taper(page, 'Rust');
  // Ctrl+→ tenu passe à la cellule suivante.
  await page.keyboard.down('Control');
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(500);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('Control');
  await taper(page, '!');
  await attendreEnregistrement(page);
  expect(await lireCorps(vault, 'Projets')).toBe(
    '```typescript\nconst reponse: number = 42;\n```\n\n| Langage | Année |\n| ------- | ----- |\n| Go      | 2009  |\n| Rust    | 2015! |\n',
  );

  // Callout, sous le tableau : flèche bas depuis la dernière ligne, le curseur passe sous le tableau.
  await touche(page, 'ArrowDown');
  await taper(page, '/callout');
  await touche(page, 'Enter');
  await taper(page, 'Penser à la sauvegarde.');
  await expect(editeur(page).locator('div[data-callout]')).toHaveText(/Penser à la sauvegarde\./);
  await attendreEnregistrement(page);
  expect(await lireCorps(vault, 'Projets')).toContain('```notes-callout\ntype: info\ntext: Penser à la sauvegarde.\n```\n');

  // Image collée : copiée dans assets/, insérée et sélectionnée, sa largeur se règle.
  await touche(page, 'Enter', 'Enter');
  await collerImage(page);
  const barre = page.getByRole('toolbar', { name: 'Image' });
  await expect(barre).toBeVisible();
  const fichiers = await readdir(join(vault, 'Projets', 'assets'));
  expect(fichiers).toHaveLength(1);
  // Convertie en WebP, comme toute image reçue.
  expect(fichiers[0]).toMatch(/^image-\d{4}-\d{2}-\d{2}-\d{6}\.webp$/);
  expect((await readFile(join(vault, 'Projets', 'assets', fichiers[0] as string))).subarray(8, 12).toString()).toBe('WEBP');
  await barre.getByRole('button', { name: 'Moyen', exact: true }).click();
  await attendreEnregistrement(page);
  expect(await lireCorps(vault, 'Projets')).toContain(`![](assets/${fichiers[0]}#largeur=66)`);

  // Le bord de l'image se tire comme dans Notion : elle suit le geste, le fichier ne change qu'au lâcher.
  const figure = editeur(page).locator('figure[data-image]');
  const image = figure.locator('img');
  await image.hover();
  const bordDroit = page.getByRole('separator', { name: "Taille de l'image, bord droit" });
  await expect(bordDroit).toBeVisible();
  expect(await bordDroit.evaluate((element: unknown) => getComputedStyle(element).cursor)).toBe('ew-resize');
  const avant = (await image.boundingBox()) as { x: number; y: number; width: number; height: number };
  const poignee = (await bordDroit.boundingBox()) as typeof avant;
  await page.mouse.move(poignee.x + poignee.width / 2, poignee.y + poignee.height / 2);
  await page.mouse.down();
  await page.mouse.move(poignee.x + poignee.width / 2 - 60, poignee.y + poignee.height / 2, { steps: 6 });
  await expect.poll(async () => ((await image.boundingBox()) as typeof avant).width).toBeLessThan(avant.width - 60);
  await page.waitForTimeout(1200);
  expect(await lireCorps(vault, 'Projets')).toContain('#largeur=66)');
  await page.mouse.up();
  await attendreEnregistrement(page);
  expect(await lireCorps(vault, 'Projets')).toMatch(/#largeur=([1-5]\d)\)/);

  // Un clic dans le vide du bloc image, à côté de l'image, ferme sa barre.
  await image.click();
  await expect(barre).toBeVisible();
  const bloc = (await figure.boundingBox()) as typeof avant;
  await page.mouse.click(bloc.x + bloc.width - 6, bloc.y + bloc.height / 2);
  await expect(barre).toHaveCount(0);

  await image.click();
  await expect(barre.getByRole('button', { name: 'Grand', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await barre.getByRole('button', { name: 'Petit', exact: true }).click();
  await barre.getByRole('button', { name: 'Grand', exact: true }).click();
  await attendreEnregistrement(page);
  expect(await lireCorps(vault, 'Projets')).toContain(`![](assets/${fichiers[0]})`);
  await expect(editeur(page).locator('figure[data-image] img')).toHaveJSProperty('naturalWidth', 1);

  await page.screenshot({ path: test.info().outputPath('page-technique.png') });
  await fermer(session);
});

test('les blocs riches du vault d’exemple s’affichent et ressortent à l’identique', async () => {
  const session = await lancer(await preparer());
  const { page, vault } = session;
  const avant = await readFile(join(vault, 'Bienvenue', 'page.md'), 'utf8');
  await ouvrirPage(page, 'Bienvenue');
  await expect(editeur(page).locator('table th')).toHaveText(['Colonne', 'Autre']);
  await expect(editeur(page).locator('div[data-callout] .callout-icone')).toHaveText('💡');
  // Dans la barre d'outils, la nature du callout a sa pastille de couleur, comme dans sa liste.
  await editeur(page).locator('div[data-callout] p').first().click();
  await expect(page.getByRole('button', { name: /^Nature du callout/ }).locator('.callout-pastille')).toBeVisible();
  await page.keyboard.press('Escape');
  // L'image vient du dossier de la page, par le protocole du main.
  await expect(editeur(page).locator('figure[data-image] img')).toHaveJSProperty('naturalWidth', 240);
  await expect(editeur(page).locator('figure[data-image] figcaption')).toHaveText('Une image copiée dans le dossier de la page');
  await editeur(page).locator('pre').last().scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('bienvenue.png') });

  // Double-clic : la visionneuse, fermée par Échap.
  await editeur(page).locator('figure[data-image] img').dblclick();
  const visionneuse = page.getByRole('dialog', { name: 'Un petit schéma' });
  await expect(visionneuse).toBeVisible();
  await touche(page, 'Escape');
  await expect(visionneuse).toBeHidden();

  await fermer(session);
  expect(await readFile(join(vault, 'Bienvenue', 'page.md'), 'utf8')).toBe(avant);
});

test('les poignées du tableau ajoutent et retirent des colonnes, le code se copie', async () => {
  const session = await lancer(await preparer());
  const { page, vault } = session;
  await ouvrirPage(page, 'Bienvenue');
  const table = editeur(page).locator('table');
  const colonne = page.getByRole('button', { name: 'Ajouter une colonne', exact: true });
  const ligneEnPlus = page.getByRole('button', { name: 'Ajouter une ligne', exact: true });

  // Curseur dans le tableau, souris au milieu : pas de poignée « + ». Elle vient à l'approche du bord droit.
  await editeur(page).locator('td', { hasText: 'b' }).click();
  await page.mouse.move(10, 10);
  await expect(colonne).toHaveCount(0);
  const bord = (await table.boundingBox()) as { x: number; y: number; width: number; height: number };
  await page.mouse.move(bord.x + bord.width - 4, bord.y + bord.height / 2);
  await expect(colonne).toBeVisible();
  await expect(ligneEnPlus).toHaveCount(0);
  expect((await colonne.boundingBox())?.width).toBe(16);

  // Un clic sur la poignée de droite ajoute une colonne.
  // La barre d'outils, au-dessus de la ligne du curseur, couvre le haut de la poignée : on la prend par le bas.
  const hauteur = ((await colonne.boundingBox()) as typeof bord).height;
  await colonne.click({ position: { x: 8, y: hauteur - 6 } });
  await expect(editeur(page).locator('table tr').first().locator('th')).toHaveCount(3);

  // Tirée vers la droite, elle en ajoute ; ramenée vers la gauche, elle retire les colonnes vides, et rien d'autre.
  const apres = (await colonne.boundingBox()) as typeof bord;
  const x = apres.x + apres.width / 2;
  const y = apres.y + apres.height - 6;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 60, y, { steps: 5 });
  await page.mouse.move(x + 130, y, { steps: 5 });
  await expect(editeur(page).locator('table tr').first().locator('th')).toHaveCount(5);
  await page.mouse.move(x - 400, y, { steps: 10 });
  await page.mouse.up();
  await expect(editeur(page).locator('table tr').first().locator('th')).toHaveCount(2);
  await attendreEnregistrement(page);
  // Revenu à deux colonnes, sans rien perdre. Selon qu'un enregistrement est tombé entre l'ajout et le retrait,
  // le tableau garde le texte d'origine ou il est réécrit dans la forme de l'application.
  expect(await lireCorps(vault, 'Bienvenue')).toMatch(/\| Colonne \| Autre \|\n\|---\|---\|\n\| a \| b \|\n|\| Colonne \| Autre \|\n\| -+ \| -+ \|\n\| a +\| b +\|\n/);

  // Près du bord bas, la poignée des lignes, plus haute qu'avant.
  const bas = (await table.boundingBox()) as typeof bord;
  await page.mouse.move(bas.x + bas.width / 3, bas.y + bas.height - 3);
  await expect(ligneEnPlus).toBeVisible();
  expect((await ligneEnPlus.boundingBox())?.height).toBe(16);

  // Le bouton « Copier » du bloc de code.
  await page.getByRole('button', { name: 'Copier', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Code copié' })).toBeAttached();
  expect(await page.evaluate(() => navigator.clipboard.readText().catch(() => 'lecture refusée'))).toBe('lecture refusée');
  await fermer(session);
});

test('la barre d’outils d’un tableau et les poignées de ligne et de colonne', async () => {
  const session = await lancer(await preparer());
  const { page, vault } = session;
  await ouvrirPage(page, 'Bienvenue');
  const lignes = () => editeur(page).locator('table tr');

  // Barre d'outils : l'étiquette « Tableau », un « + » qui ouvre les ajouts, une corbeille qui ouvre les suppressions.
  await editeur(page).locator('td', { hasText: 'b' }).click();
  await page.getByRole('button', { name: 'Ajouter une ligne ou une colonne' }).click();
  await expect(page.getByRole('menu', { name: 'Ajouter une ligne ou une colonne' }).getByRole('menuitem')).toHaveText([
    'Ligne au-dessus', 'Ligne en dessous', 'Colonne à gauche', 'Colonne à droite',
  ]);
  await page.getByRole('menuitem', { name: 'Ligne en dessous' }).click();
  await expect(lignes()).toHaveCount(3);
  await lignes().nth(2).locator('td').first().click();
  await page.keyboard.type('c', { delay: 15 });
  // La barre d'outils s'efface à la frappe : un clic la ramène.
  await editeur(page).locator('td', { hasText: /^c$/ }).click();
  await page.waitForTimeout(150);
  await page.getByRole('button', { name: 'Supprimer', exact: true }).click();
  await expect(page.getByRole('menu', { name: 'Supprimer' }).getByRole('menuitem')).toHaveText(['Supprimer la ligne', 'Supprimer la colonne', 'Supprimer le tableau']);
  await page.keyboard.press('Escape');

  // Poignée de ligne : au survol d'une cellule, à gauche de sa ligne. Un clic sélectionne la ligne et ouvre son menu.
  await editeur(page).locator('td', { hasText: /^c$/ }).hover();
  const poigneeLigne = page.getByRole('button', { name: 'Ligne : déplacer ou ouvrir son menu' });
  // La poignée du tableau entier reste dans la marge de la page, à la hauteur de celle de la première ligne, sans la toucher.
  await lignes().first().locator('th').first().hover();
  const poigneeBloc = page.getByRole('button', { name: 'Déplacer le bloc ou ouvrir son menu' });
  const bloc = (await poigneeBloc.boundingBox()) as { x: number; y: number; width: number; height: number };
  const grippeLigne = (await poigneeLigne.boundingBox()) as typeof bloc;
  const barre = (await page.getByRole('navigation', { name: 'Arborescence des pages' }).boundingBox()) as typeof bloc;
  // Un espace net entre le panneau latéral et la poignée, pas un simple contact.
  expect(bloc.x).toBeGreaterThanOrEqual(barre.x + barre.width + 16);
  expect(Math.abs(bloc.y + bloc.height / 2 - (grippeLigne.y + grippeLigne.height / 2))).toBeLessThan(2);
  expect(bloc.x + bloc.width).toBeLessThanOrEqual(grippeLigne.x);

  await editeur(page).locator('td', { hasText: /^c$/ }).hover();
  await poigneeLigne.click();
  await expect(editeur(page).locator('.selectedCell')).toHaveCount(2);
  await page.getByRole('menuitem', { name: 'Mettre en en-tête' }).click();
  await expect(lignes().first().locator('th')).toHaveText(['c', '']);
  await attendreEnregistrement(page);
  expect(await lireCorps(vault, 'Bienvenue')).toContain('| c       |       |\n| ------- | ----- |\n| Colonne | Autre |\n| a       | b     |\n');

  // Glisser la poignée de colonne de « Autre » vers la gauche la met en premier.
  await editeur(page).locator('td', { hasText: /^b$/ }).hover();
  const poigneeColonne = page.getByRole('button', { name: 'Colonne : déplacer ou ouvrir son menu' });
  const depart = (await poigneeColonne.boundingBox()) as { x: number; y: number; width: number; height: number };
  const premiere = (await lignes().first().locator('th').first().boundingBox()) as typeof depart;
  await page.mouse.move(depart.x + depart.width / 2, depart.y + depart.height / 2);
  await page.mouse.down();
  await page.mouse.move(premiere.x + 10, depart.y + depart.height / 2, { steps: 8 });
  await page.mouse.up();
  await attendreEnregistrement(page);
  expect(await lireCorps(vault, 'Bienvenue')).toContain('|       | c       |\n| ----- | ------- |\n| Autre | Colonne |\n| b     | a       |\n');
  await fermer(session);
});

test('un lien d’image collé se télécharge dans la page, ou reste du texte', async () => {
  // Un petit site local : une image, une page qui n'en est pas une.
  const serveur = createServer((requete, reponse) => {
    if (requete.url === '/photo.png') {
      reponse.writeHead(200, { 'content-type': 'image/png' }).end(Buffer.from(png));
    } else {
      reponse.writeHead(200, { 'content-type': 'image/png' }).end('<html>');
    }
  });
  await new Promise<void>((resoudre) => serveur.listen(0, '127.0.0.1', resoudre));
  const site = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}`;
  const coller = (texte: string) =>
    editeur(page).evaluate((zone: { dispatchEvent(evenement: unknown): void }, contenu) => {
      const donnees = new DataTransfer() as unknown as { setData(type: string, valeur: string): void };
      donnees.setData('text/plain', contenu);
      zone.dispatchEvent(new ClipboardEvent('paste', { clipboardData: donnees, bubbles: true, cancelable: true }));
    }, texte);

  const session = await lancer(await preparer());
  const { page, vault } = session;
  await ouvrirPage(page, 'Projets');
  await editeur(page).click();
  const question = page.getByRole('dialog', { name: "Image d'Internet" });

  // « Garder le lien » : le texte collé, rien de téléchargé.
  await coller(`${site}/photo.png`);
  await expect(question).toBeVisible();
  await question.getByRole('button', { name: 'Garder le lien' }).click();
  await expect(question).toHaveCount(0);
  await expect(editeur(page)).toContainText(`${site}/photo.png`);

  // « Télécharger » : l'image est copiée dans assets/ et insérée.
  await touche(page, 'End', 'Enter');
  await coller(`${site}/photo.png`);
  await question.getByRole('button', { name: 'Télécharger' }).click();
  await expect(editeur(page).locator('figure[data-image] img')).toHaveJSProperty('naturalWidth', 1);
  expect(await readdir(join(vault, 'Projets', 'assets'))).toEqual(['photo.webp']);
  await attendreEnregistrement(page);
  expect(await lireCorps(vault, 'Projets')).toContain('![](assets/photo.webp)');

  // Un lien qui ne mène pas à une image : un message, le lien reste en texte.
  await editeur(page).locator('p').first().click();
  await touche(page, 'End', 'Enter');
  await coller(`${site}/faux.png`);
  await question.getByRole('button', { name: 'Télécharger' }).click();
  await expect(page.getByRole('alert')).toContainText("L'image n'a pas été téléchargée");
  await expect(editeur(page)).toContainText(`${site}/faux.png`);
  expect(await readdir(join(vault, 'Projets', 'assets'))).toEqual(['photo.webp']);

  // Échap garde le lien aussi.
  await coller(' https://example.invalid/x.jpg');
  await expect(question).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(question).toHaveCount(0);
  await expect(editeur(page)).toContainText('https://example.invalid/x.jpg');
  await fermer(session);
  await new Promise((resoudre) => serveur.close(resoudre));
});

test('les images déjà dans le dossier des notes se convertissent en WebP depuis les réglages', async () => {
  const session = await lancer(await preparer());
  const { page, vault } = session;
  await page.getByRole('button', { name: 'Réglages', exact: true }).click();
  const bloc = page.getByRole('region', { name: 'Images en WebP' });
  await expect(bloc.getByRole('status')).toHaveText('Une image en PNG, JPEG ou AVIF.');
  await bloc.getByRole('button', { name: 'Convertir' }).click();
  await expect(bloc.getByRole('status')).toContainText('Une image convertie');

  // La page renvoie à la version WebP, avec ses réglages et sa légende ; l'ancien fichier reste.
  const corps = await lireCorps(vault, 'Bienvenue');
  expect(corps).toContain('![Un petit schéma](assets/schema.webp "Une image copiée dans le dossier de la page")');
  expect((await readdir(join(vault, 'Bienvenue', 'assets'))).sort()).toEqual(['schema.png', 'schema.webp']);
  const images = page.getByRole('region', { name: 'Images inutilisées' });
  await images.getByRole('button', { name: 'Chercher' }).click();
  await expect(images.getByRole('status')).toHaveText('Une image inutilisée.');

  // L'image s'affiche toujours dans la page.
  await page.getByRole('button', { name: 'Réglages', exact: true }).click();
  await ouvrirPage(page, 'Bienvenue');
  await expect(editeur(page).locator('figure[data-image] img')).toHaveJSProperty('naturalWidth', 240);
  await fermer(session);
});

test('une grande image collée est réduite à 1920 px de large, en WebP', async () => {
  const session = await lancer(await preparer());
  const { page, vault } = session;
  await ouvrirPage(page, 'Projets');
  await editeur(page).click();
  // Une capture de 3000 × 600, fabriquée dans la page puis collée.
  await editeur(page).evaluate(async (zone: { dispatchEvent(evenement: unknown): void }) => {
    const toile = new OffscreenCanvas(3000, 600);
    const contexte = toile.getContext('2d') as unknown as { fillStyle: string; fillRect(x: number, y: number, l: number, h: number): void };
    contexte.fillStyle = '#3366cc';
    contexte.fillRect(0, 0, 3000, 600);
    const png = await toile.convertToBlob({ type: 'image/png' });
    const donnees = new DataTransfer();
    donnees.items.add(new File([png], 'grande.png', { type: 'image/png' }));
    zone.dispatchEvent(new ClipboardEvent('paste', { clipboardData: donnees, bubbles: true, cancelable: true }));
  });
  await expect(editeur(page).locator('figure[data-image] img')).toHaveJSProperty('naturalWidth', 1920);
  await expect(editeur(page).locator('figure[data-image] img')).toHaveJSProperty('naturalHeight', 384);
  expect(await readdir(join(vault, 'Projets', 'assets'))).toEqual(['grande.webp']);
  await fermer(session);
});

test('une image copiée d’une page et collée dans une autre y est copiée et s’affiche', async () => {
  const session = await lancer(await preparer());
  const { page, vault } = session;
  await ouvrirPage(page, 'Bienvenue');
  // Clic sur l'image : elle est sélectionnée, Ctrl+C la copie avec sa page d'origine.
  await editeur(page).locator('figure[data-image] img').first().click();
  await page.keyboard.press('Control+c');
  await ouvrirPage(page, 'Courses');
  await editeur(page).click();
  await page.waitForTimeout(100);
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Control+v');
  await attendreEnregistrement(page);
  // Le fichier est copié dans les assets de Courses, et la page y renvoie.
  await expect.poll(() => lireCorps(vault, 'Courses')).toContain('![');
  await expect.poll(async () => (await lireCorps(vault, 'Courses')).match(/\]\((assets\/[^)\s#]+)/)?.[1] ?? '').toMatch(/^assets\/schema(-\d+)?\.png$/);
  expect((await readdir(join(vault, 'Courses', 'assets'))).length).toBe(1);
  const image = editeur(page).locator('figure[data-image] img').last();
  await expect.poll(() => image.evaluate((element: { naturalWidth: number }) => element.naturalWidth)).toBeGreaterThan(0);
  await fermer(session);
});

test('tableau : colonnes fixes réglées en glissant leur bordure, gardées dans l’en-tête ; Ctrl+Entrée coupe une cellule en `<br>`', async () => {
  const preparation = await preparer();
  const fichier = join(preparation.vault, 'Bienvenue', 'page.md');
  const enTete = (await readFile(fichier, 'utf8')).split('\n---\n')[0];
  await writeFile(fichier, `${enTete}\n---\n| Colonne A | Colonne B |\n| --- | --- |\n| long | court |\n`);
  const session = await lancer(preparation);
  const { page } = session;
  await ouvrirPage(page, 'Bienvenue');
  const tableau = editeur(page).locator('table');
  // Sans largeurs, deux colonnes égales sur toute la largeur.
  const [a, b] = await tableau.locator('tr').first().locator('th').evaluateAll((cellules) => cellules.map((cellule) => cellule.getBoundingClientRect().width));
  expect(Math.abs(a! - b!)).toBeLessThan(2);

  // Ctrl+Entrée dans une cellule : un saut de ligne, écrit `<br>` dans le fichier.
  // La page place d'abord le curseur au début, juste après son chargement : le second clic vient après.
  await editeur(page).getByText('court').click();
  await page.waitForTimeout(300);
  await editeur(page).getByText('court').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Control+Enter');
  await page.keyboard.type('suite', { delay: 15 });
  await attendreEnregistrement(page);
  await expect.poll(() => readFile(fichier, 'utf8')).toContain('court<br>suite');

  // La bordure entre les deux colonnes se glisse : 75 % et 25 %, dans l'en-tête de la page, corps inchangé.
  const entete = tableau.locator('th').first();
  const cadre = (await entete.boundingBox())!;
  const largeurDuTableau = (await tableau.boundingBox())!.width;
  await page.mouse.move(cadre.x + cadre.width - 2, cadre.y + cadre.height / 2);
  await page.mouse.down();
  await page.mouse.move(cadre.x + cadre.width - 2 + largeurDuTableau / 4, cadre.y + cadre.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => readFile(fichier, 'utf8')).toContain('table_widths:\n  - [75, 25]\n');
  expect(await readFile(fichier, 'utf8')).toContain('| long      | court<br>suite |');

  // Rouverte, la page garde ses largeurs.
  await ouvrirPage(page, 'Courses');
  await ouvrirPage(page, 'Bienvenue');
  await expect(editeur(page).locator('col').first()).toHaveAttribute('style', /width: 75%/);
  await fermer(session);
});
