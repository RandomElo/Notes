import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { attendreEnregistrement, editeur, fermer, lancer, ligne, lireCorps, ouvrirPage, preparer, titreDePage } from './app';

// Critère de sortie de J3 : une page se restructure sans souris.

// Un court délai entre les touches : envoyées d'un bloc, elles arrivent avant que l'éditeur ait suivi la sélection.
const taper = (page: Page, texte: string) => page.keyboard.type(texte, { delay: 15 });
const touche = async (page: Page, ...touches: string[]) => {
  for (const nom of touches) {
    await page.keyboard.press(nom, { delay: 15 });
  }
};
/** Texte des blocs sélectionnés. */
const selectionnes = (page: Page) => editeur(page).locator('.bloc-selectionne');

test('une page se restructure entièrement au clavier', async () => {
  const session = await lancer(await preparer());
  const { page, vault } = session;
  await ouvrirPage(page, 'Projets');
  // Seul clic du test : entrer dans la page. Tout le reste se fait au clavier.
  await editeur(page).click();

  await taper(page, 'un');
  await touche(page, 'Enter');
  await taper(page, 'deux');
  await touche(page, 'Enter');
  await taper(page, 'trois');
  await attendreEnregistrement(page);
  expect(await lireCorps(vault, 'Projets')).toBe('un\n\ndeux\n\ntrois\n');

  // Ctrl+Maj+flèche déplace le bloc du curseur, qui reste dans son texte.
  await touche(page, 'Control+Shift+ArrowUp');
  await taper(page, '!');
  await attendreEnregistrement(page);
  expect(await lireCorps(vault, 'Projets')).toBe('un\n\ntrois!\n\ndeux\n');

  // Échap sélectionne le bloc, les flèches naviguent, Maj+flèche étend, Ctrl+Maj+flèche déplace le tout.
  await touche(page, 'Escape');
  await expect(selectionnes(page)).toHaveText(['trois!']);
  await touche(page, 'ArrowUp');
  await expect(selectionnes(page)).toHaveText(['un']);
  await touche(page, 'Shift+ArrowDown');
  await expect(selectionnes(page)).toHaveText(['un', 'trois!']);
  await touche(page, 'Control+Shift+ArrowDown');
  await attendreEnregistrement(page);
  expect(await lireCorps(vault, 'Projets')).toBe('deux\n\nun\n\ntrois!\n');
  await expect(selectionnes(page)).toHaveText(['un', 'trois!']);

  // Une frappe ne remplace pas des blocs sélectionnés.
  await taper(page, 'x');
  await expect(editeur(page).locator('p')).toHaveText(['deux', 'un', 'trois!']);

  // Ctrl+D duplique, Suppr supprime, Entrée rend le curseur.
  await touche(page, 'Control+d');
  await expect(editeur(page).locator('p')).toHaveText(['deux', 'un', 'trois!', 'un', 'trois!']);
  await touche(page, 'Delete');
  await expect(editeur(page).locator('p')).toHaveText(['deux', 'un', 'trois!']);
  await expect(selectionnes(page)).toHaveText(['trois!']);
  await touche(page, 'Enter');
  await expect(selectionnes(page)).toHaveCount(0);
  await taper(page, ' fin');

  // Le menu « / » : un titre, puis une liste.
  await touche(page, 'Enter');
  await taper(page, '/tit');
  await expect(page.getByRole('listbox', { name: 'Commandes' }).getByRole('option')).toHaveText(['Titre 1', 'Titre 2', 'Titre 3', 'Titre 4', 'Titre 5']);
  await touche(page, 'ArrowDown', 'Enter');
  await taper(page, 'Section');
  await touche(page, 'Enter');
  await taper(page, '/puces');
  await touche(page, 'Enter');
  await taper(page, 'a');
  await touche(page, 'Enter');
  await taper(page, 'b');
  await touche(page, 'Enter');
  await taper(page, 'c');
  await attendreEnregistrement(page);
  expect(await lireCorps(vault, 'Projets')).toBe('deux\n\nun\n\ntrois! fin\n\n## Section\n\n- a\n- b\n- c\n');

  // Tab et Maj+Tab indentent l'item sélectionné, Ctrl+Maj+flèche le déplace dans la liste.
  await touche(page, 'Escape');
  await expect(selectionnes(page)).toHaveText(['c']);
  await touche(page, 'Tab');
  await attendreEnregistrement(page);
  expect(await lireCorps(vault, 'Projets')).toContain('- a\n- b\n  - c\n');
  // Flèche haut : l'item « b ». Seule sa ligne est mise en évidence, mais son sous-item le suit quand il bouge.
  await touche(page, 'ArrowUp');
  await expect(selectionnes(page)).toHaveText(['b']);
  await touche(page, 'Control+Shift+ArrowUp');
  await attendreEnregistrement(page);
  expect(await lireCorps(vault, 'Projets')).toContain('- b\n  - c\n- a\n');
  await touche(page, 'ArrowDown', 'Shift+Tab', 'Control+Shift+ArrowDown');
  await attendreEnregistrement(page);
  expect(await lireCorps(vault, 'Projets')).toContain('- b\n- a\n- c\n');

  // Le premier item sort de la liste par le haut et passe au-dessus du titre.
  await touche(page, 'ArrowUp', 'ArrowUp');
  await expect(selectionnes(page)).toHaveText(['b']);
  // Échap sur un item : toute la liste. Encore Échap : plus de sélection, le curseur est à la fin de la liste.
  await touche(page, 'Escape');
  await expect(editeur(page).locator('ul.bloc-selectionne')).toHaveText('bac');
  await touche(page, 'Escape');
  await expect(selectionnes(page)).toHaveCount(0);
  await touche(page, 'Escape', 'Shift+ArrowUp');
  await expect(selectionnes(page)).toHaveText(['a', 'c']);
  await touche(page, 'ArrowUp');
  await expect(selectionnes(page)).toHaveText(['b']);
  await touche(page, 'Control+Shift+ArrowUp');
  await attendreEnregistrement(page);
  expect(await lireCorps(vault, 'Projets')).toBe('deux\n\nun\n\ntrois! fin\n\n- b\n\n## Section\n\n- a\n- c\n');

  // Tout s'annule au clavier aussi.
  await touche(page, 'Control+z');
  await attendreEnregistrement(page);
  expect(await lireCorps(vault, 'Projets')).toContain('## Section\n\n- b\n- a\n- c\n');
  await fermer(session);
});

test('le menu « / » se filtre sans accents, se ferme sur Échap et insère titre et date', async () => {
  const session = await lancer(await preparer());
  const { page, vault } = session;
  await ouvrirPage(page, 'Projets');
  await editeur(page).click();
  const menu = page.getByRole('listbox', { name: 'Commandes' });

  await taper(page, '/');
  await expect(menu.getByRole('option')).toHaveCount(15);
  // Ni citation ni séparateur dans le menu.
  await taper(page, 'sepa');
  await expect(menu.getByRole('option')).toHaveCount(0);
  await touche(page, 'Backspace', 'Backspace', 'Backspace', 'Backspace');
  await taper(page, 'TITRE 2');
  await expect(menu.getByRole('option')).toHaveText(['Titre 2']);
  await touche(page, 'Enter');
  await expect(editeur(page).locator('h2')).toHaveCount(1);

  // Échap ferme le menu sans toucher au texte, et il ne se rouvre pas en continuant de taper.
  await taper(page, 'voir /usr');
  await expect(menu).toBeVisible();
  await touche(page, 'Escape');
  await expect(menu).toBeHidden();
  await taper(page, 'x');
  await expect(menu).toBeHidden();
  // Le bloc n'a pas été sélectionné : Échap n'a servi qu'à fermer le menu.
  await expect(selectionnes(page)).toHaveCount(0);

  // Dans un bloc qui contient déjà du texte, une commande de bloc en crée un nouveau dessous.
  await taper(page, ' /code');
  await touche(page, 'Enter');
  await taper(page, 'ls /tmp');
  await expect(menu).toBeHidden();
  await touche(page, 'Control+Enter');
  await taper(page, 'Le /date');
  await touche(page, 'Enter');
  await taper(page, '.');
  await attendreEnregistrement(page);
  expect(await lireCorps(vault, 'Projets')).toMatch(/^## voir \/usrx\n\n```\nls \/tmp\n```\n\nLe \d{1,2}(er)? \S+ \d{4}\.\n$/);

  // Une recherche sans résultat le dit, et Entrée reste un retour à la ligne.
  await touche(page, 'Enter');
  await taper(page, '/zzz');
  await expect(menu).toContainText('Aucune commande');
  await fermer(session);
});

test('la barre d’outils apparaît sur une sélection, met en forme, change la nature du bloc et disparaît à la frappe', async () => {
  const session = await lancer(await preparer());
  const { page, vault } = session;
  await ouvrirPage(page, 'Courses');
  const barre = page.getByRole('toolbar', { name: 'Mise en forme' });
  await expect(barre).toBeHidden();

  // Double-clic sur le mot lui-même : il est sélectionné.
  await editeur(page).locator('li', { hasText: 'Tomates' }).locator('p').dblclick({ position: { x: 20, y: 10 } });
  await expect(barre).toBeVisible();
  await expect(barre.getByRole('button', { name: /Nature du bloc/ })).toHaveText('Tâches');
  await barre.getByRole('button', { name: 'Gras' }).click();
  await expect(barre.getByRole('button', { name: 'Gras' })).toHaveAttribute('aria-pressed', 'true');
  await attendreEnregistrement(page);
  expect(await lireCorps(vault, 'Courses')).toBe('- [ ] Pâtes\n- [ ] **Tomates**\n- [x] Café\n');

  // La frappe la fait disparaître, Échap aussi.
  await touche(page, 'End');
  await taper(page, ' cerises');
  await expect(barre).toBeHidden();
  // Un simple clic dans le texte ne la montre pas.
  await editeur(page).locator('li', { hasText: 'Pâtes' }).locator('p').click();
  await page.waitForTimeout(200);
  await expect(barre).toBeHidden();
  await editeur(page).locator('li', { hasText: 'Pâtes' }).locator('p').dblclick({ position: { x: 20, y: 10 } });
  await expect(barre).toBeVisible();
  await touche(page, 'Escape');
  await expect(barre).toBeHidden();

  // Du texte sélectionné au clavier la fait revenir.
  await touche(page, 'Enter', 'Shift+Home');
  await expect(barre).toBeVisible();

  // Changer la nature du bloc.
  await ouvrirPage(page, 'Projets');
  await editeur(page).click();
  await taper(page, 'Un titre');
  await editeur(page).locator('p').dblclick({ position: { x: 10, y: 10 } });
  await barre.getByRole('button', { name: /Nature du bloc/ }).click();
  await barre.getByRole('option', { name: 'Titre 2' }).click();
  await expect(editeur(page).locator('h2')).toHaveText('Un titre');
  await barre.getByRole('button', { name: /Nature du bloc/ }).click();
  await barre.getByRole('option', { name: 'Code' }).click();
  // Dans un bloc de code, pas de mise en forme du texte.
  await expect(barre.getByRole('button', { name: 'Gras' })).toHaveCount(0);
  await attendreEnregistrement(page);
  expect(await lireCorps(vault, 'Projets')).toBe('```\nUn titre\n```\n');
  await fermer(session);
});

test('le titre de la page se modifie sur place et renomme la page', async () => {
  const session = await lancer(await preparer());
  const { page, vault } = session;
  await ouvrirPage(page, 'Courses');
  const titre = titreDePage(page);

  await titre.click();
  await touche(page, 'End');
  await taper(page, ' du samedi');
  // Entrée valide le titre et passe au contenu.
  await touche(page, 'Enter');
  await expect(ligne(page, 'Courses du samedi')).toBeVisible();
  await expect(titre).toHaveText('Courses du samedi');
  await access(join(vault, 'Courses du samedi', 'page.md'));
  expect(await lireCorps(vault, 'Courses du samedi')).toBe('- [ ] Pâtes\n- [ ] Tomates\n- [x] Café\n');

  // Le curseur est au début du contenu, et la page renommée s'enregistre à son nouvel emplacement.
  await taper(page, 'Grandes ');
  await attendreEnregistrement(page);
  expect(await lireCorps(vault, 'Courses du samedi')).toBe('- [ ] Grandes Pâtes\n- [ ] Tomates\n- [x] Café\n');

  // Flèche haut au début du contenu remonte dans le titre. Un titre vide est refusé et l'ancien revient.
  await touche(page, 'Home', 'ArrowUp');
  await expect(titre).toBeFocused();
  await touche(page, 'Control+a', 'Delete', 'ArrowDown');
  await expect(page.getByRole('alert')).toContainText('Le titre est vide');
  await expect(titre).toHaveText('Courses du samedi');

  // Échap annule la saisie en cours.
  await titre.click();
  await taper(page, 'zzz');
  await touche(page, 'Escape');
  await expect(titre).toHaveText('Courses du samedi');
  await fermer(session);
});

test('« /page » crée une sous-page : on la nomme, puis le curseur est dans son contenu', async () => {
  const session = await lancer(await preparer());
  const { page, vault } = session;
  await ouvrirPage(page, 'Courses');
  await editeur(page).click();
  await touche(page, 'Control+End', 'Enter');
  await taper(page, '/page');
  await touche(page, 'Enter');

  // Le nom se tape dans l'arborescence, Entrée le valide.
  await expect(page.getByRole('tree').getByRole('textbox', { name: 'Titre de la page' })).toBeFocused();
  await taper(page, 'Marché');
  await touche(page, 'Enter');
  await expect(titreDePage(page)).toHaveText('Marché');
  await expect(editeur(page)).toBeFocused();
  await taper(page, 'dedans');
  await attendreEnregistrement(page);
  expect(await lireCorps(vault, join('Courses', 'Marché'))).toBe('dedans\n');

  // Échap sélectionne le bloc, une deuxième fois le désélectionne et rend le curseur.
  await touche(page, 'Escape');
  await expect(selectionnes(page)).toHaveText(['dedans']);
  await touche(page, 'Escape');
  await expect(selectionnes(page)).toHaveCount(0);
  await taper(page, ' encore');
  await attendreEnregistrement(page);
  expect(await lireCorps(vault, join('Courses', 'Marché'))).toBe('dedans encore\n');
  await fermer(session);
});

test('la poignée apparaît au survol d’un bloc ou sur une sélection, ouvre son menu et déplace par glisser-déposer', async () => {
  const session = await lancer(await preparer());
  const { page, vault } = session;
  await ouvrirPage(page, 'Courses');
  const poignee = page.getByRole('button', { name: 'Déplacer le bloc ou ouvrir son menu' });
  /** Place le curseur dans une ligne, puis la sélectionne. Courte attente : l'éditeur suit le clic avec un temps de retard. */
  const selectionnerLigne = async (texte: string) => {
    await editeur(page).locator('li', { hasText: texte }).first().locator('p').click();
    await page.waitForTimeout(150);
    await touche(page, 'Escape');
  };

  // Au survol d'un bloc, la poignée apparaît à sa hauteur, et disparaît quand la souris quitte la page.
  const tomates = editeur(page).locator('li', { hasText: 'Tomates' }).locator('p');
  await tomates.hover();
  await expect(poignee).toBeVisible();
  const ligneTomates = await tomates.boundingBox();
  const placePoignee = await poignee.boundingBox();
  expect(Math.abs((placePoignee?.y ?? 0) - (ligneTomates?.y ?? 0))).toBeLessThan(8);
  await page.mouse.move(5, 300);
  await expect(poignee).toHaveCount(0);
  // Sur une sélection de blocs, elle reste quand la souris est ailleurs.
  await selectionnerLigne('Café');
  await page.mouse.move(5, 300);
  await expect(poignee).toBeVisible();
  // Un clic sur la poignée d'un bloc survolé le sélectionne et ouvre le menu.
  await tomates.hover();
  await poignee.hover();
  await poignee.click();
  await expect(selectionnes(page)).toHaveCount(1);
  await expect(selectionnes(page)).toContainText('Tomates');
  await page.getByRole('menuitem', { name: /Dupliquer/ }).click();
  await attendreEnregistrement(page);
  expect(await lireCorps(vault, 'Courses')).toBe('- [ ] Pâtes\n- [ ] Tomates\n- [ ] Tomates\n- [x] Café\n');

  // Glisser « Café » au-dessus de « Pâtes ».
  await selectionnerLigne('Café');
  const depart = await poignee.boundingBox();
  const arrivee = await editeur(page).locator('li', { hasText: 'Pâtes' }).locator('p').boundingBox();
  if (depart === null || arrivee === null) {
    throw new Error('poignée ou cible introuvable');
  }
  await page.mouse.move(depart.x + depart.width / 2, depart.y + depart.height / 2, { steps: 4 });
  await page.mouse.down();
  // Tout au début du texte de « Pâtes » : le bloc se dépose avant lui.
  await page.mouse.move(arrivee.x + 1, arrivee.y + 8, { steps: 8 });
  await page.mouse.move(arrivee.x + 1, arrivee.y + 6, { steps: 3 });
  await page.mouse.up();
  await attendreEnregistrement(page);
  expect(await lireCorps(vault, 'Courses')).toBe('- [x] Café\n- [ ] Pâtes\n- [ ] Tomates\n- [ ] Tomates\n');
  await fermer(session);
});

test('un clic sous le dernier bloc met le curseur dans un paragraphe vide, sans rien écrire', async () => {
  const session = await lancer(await preparer());
  const { page, vault } = session;
  await ouvrirPage(page, 'Courses');
  const avant = await lireCorps(vault, 'Courses');
  const cliquerSous = async () => {
    const cadre = await editeur(page).boundingBox();
    if (cadre === null) {
      throw new Error('éditeur introuvable');
    }
    await page.mouse.click(cadre.x + 100, cadre.y + cadre.height + 40);
    await page.waitForTimeout(150);
  };

  await cliquerSous();
  await expect(editeur(page).locator('> p')).toHaveCount(1);
  await page.waitForTimeout(1200);
  expect(await lireCorps(vault, 'Courses')).toBe(avant);
  // Un second clic garde ce paragraphe vide au lieu d'en créer un autre.
  await cliquerSous();
  await expect(editeur(page).locator('> p')).toHaveCount(1);
  // Ce qu'on tape va dans ce paragraphe, après la liste.
  await taper(page, 'Pain');
  await attendreEnregistrement(page);
  expect(await lireCorps(vault, 'Courses')).toBe(`${avant}\nPain\n`);
  await fermer(session);
});
