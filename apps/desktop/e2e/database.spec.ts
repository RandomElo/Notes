import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { actionDePage, attendreEnregistrement, editeur, fermer, lancer, lireCorps, ouvrirPage, preparer } from './app';

// Base de données (docs/spec/base-de-donnees.md) : une sous-page par ligne, valeurs dans leur en-tête, tableau écrit dans la page.

test('une page devient une base : lignes, champs, valeurs, tri, tableau écrit dans la page', async () => {
  const session = await lancer(await preparer());
  const { page, vault } = session;
  await ouvrirPage(page, 'Projets');
  await editeur(page).click();
  await page.keyboard.type('Mes projets en cours.');
  await actionDePage(page, 'Passer en base de données');
  await page.getByRole('dialog', { name: 'Passer en base de données' }).getByRole('button', { name: /^Une page par ligne/ }).click();
  const base = page.getByRole('region', { name: 'Base de données' });
  await expect(base).toBeVisible();
  // Les deux sous-pages de « Projets » sont déjà des lignes (sous l'en-tête) ; le champ « État » est créé d'office.
  // La dernière case de l'en-tête porte le « + » qui ajoute une colonne.
  await expect(base.getByRole('columnheader')).toHaveText(['Page', 'État', '']);
  await expect(base.getByRole('row')).toHaveCount(3);
  expect(await readFile(join(vault, 'Projets', 'page.md'), 'utf8')).toContain('mode: base\nbase:\n  fields:\n    - {name: État, type: state}');

  // Une ligne neuve : une sous-page.
  await base.getByRole('button', { name: 'Nouvelle ligne' }).click();
  await page.keyboard.type('Vélo');
  await page.keyboard.press('Enter');
  await expect(base.getByRole('row')).toHaveCount(4);
  expect(await readFile(join(vault, 'Projets', 'Vélo', 'page.md'), 'utf8')).toContain('title: Vélo');

  // Un champ nombre (par le « + » de l'en-tête), des valeurs.
  await base.getByRole('columnheader').last().getByRole('button', { name: 'Nouvelle colonne' }).click();
  await page.getByRole('textbox', { name: 'Nom du champ' }).fill('Priorité');
  await page.getByRole('combobox', { name: 'Type du champ' }).selectOption('nombre');
  await base.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await expect(base.getByRole('columnheader')).toHaveText(['Page', 'État', 'Priorité', '']);
  await base.getByRole('button', { name: 'Priorité de Vélo' }).click();
  await page.keyboard.type('2,5');
  await page.keyboard.press('Enter');
  await expect(base.getByRole('button', { name: 'Priorité de Vélo : 2.5' })).toHaveText('2,5');
  await base.getByRole('button', { name: /^État de Vélo/ }).click();
  await page.getByRole('menuitem', { name: 'En cours' }).click();
  await expect(base.getByRole('button', { name: 'État de Vélo : En cours' })).toBeVisible();
  expect(await readFile(join(vault, 'Projets', 'Vélo', 'page.md'), 'utf8')).toMatch(/props:\n {2}Priorité: "2\.5"\n {2}État: En cours\n/);

  // Tri par priorité, décroissant : Vélo en premier ; le tri reste dans l'en-tête de la base.
  await base.getByRole('button', { name: 'Priorité', exact: true }).click();
  await base.getByRole('button', { name: 'Priorité', exact: true }).click();
  await expect(base.getByRole('row').nth(1)).toContainText('Vélo');
  expect(await readFile(join(vault, 'Projets', 'page.md'), 'utf8')).toContain('sort:\n    field: Priorité\n    order: desc');

  // Le tableau écrit dans la page, caché dans l'éditeur, lisible hors de l'application ; le texte reste.
  await attendreEnregistrement(page);
  await expect.poll(() => lireCorps(vault, 'Projets')).toMatch(/^Mes projets en cours\.\n\n\| Page +\| État +\| Priorité \|\n/);
  expect(await lireCorps(vault, 'Projets')).toMatch(/\| \[Vélo\]\(notes:\/\/[0-9a-f-]+\) +\| En cours +\| 2,5 +\|/);
  await expect(editeur(page).locator('table')).toBeHidden();

  // Une sous-ligne : une sous-page de la ligne, décalée sous elle, repliable, avec les mêmes colonnes.
  await base.getByRole('row').filter({ hasText: 'Vélo' }).hover();
  await base.getByRole('button', { name: 'Ajouter une sous-ligne à Vélo' }).click();
  await page.keyboard.type('Changer la chaîne');
  await page.keyboard.press('Enter');
  await expect(base.getByRole('button', { name: 'Priorité de Changer la chaîne' })).toBeVisible();
  expect(await readFile(join(vault, 'Projets', 'Vélo', 'Changer la chaîne', 'page.md'), 'utf8')).toContain('title: Changer la chaîne');
  await base.getByRole('button', { name: /^État de Changer la chaîne/ }).click();
  await page.getByRole('menuitem', { name: 'Fait' }).click();
  await expect.poll(() => readFile(join(vault, 'Projets', 'Vélo', 'Changer la chaîne', 'page.md'), 'utf8')).toContain('props:\n  État: Fait\n');
  await attendreEnregistrement(page);
  await expect.poll(() => lireCorps(vault, 'Projets')).toMatch(/\| ↳ \[Changer la chaîne\]\(notes:\/\/[0-9a-f-]+\) +\| Fait +\|/);
  // Dépliée au départ ; repliée, elle le reste : l'identifiant de la ligne va dans l'en-tête de la base.
  const idDeVelo = (await readFile(join(vault, 'Projets', 'Vélo', 'page.md'), 'utf8')).match(/^id: (\S+)$/m)![1]!;
  await base.getByRole('button', { name: 'Replier les sous-lignes de Vélo' }).click();
  await expect(base.getByRole('button', { name: 'Priorité de Changer la chaîne' })).toBeHidden();
  await expect.poll(() => readFile(join(vault, 'Projets', 'page.md'), 'utf8')).toContain(`  collapsed:\n    - ${idDeVelo}\n`);
  await base.getByRole('button', { name: 'Déplier les sous-lignes de Vélo' }).click();
  await expect(base.getByRole('button', { name: 'Priorité de Changer la chaîne' })).toBeVisible();
  await expect.poll(() => readFile(join(vault, 'Projets', 'page.md'), 'utf8')).not.toContain('collapsed');

  // La largeur d'une colonne se tire depuis le bord de son en-tête et reste dans l'en-tête de la base.
  const bord = await base.getByRole('separator', { name: 'Largeur de la colonne État' }).boundingBox();
  await page.mouse.move(bord!.x + bord!.width / 2, bord!.y + bord!.height / 2);
  await page.mouse.down();
  await page.mouse.move(bord!.x + 150, bord!.y + bord!.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => readFile(join(vault, 'Projets', 'page.md'), 'utf8')).toMatch(/widths:\n {4}État: \d+\n/);

  // Un champ change de type ; une ligne part à la corbeille depuis la base.
  await base.getByRole('button', { name: 'Actions du champ Priorité' }).click();
  await page.getByRole('menuitem', { name: 'Type : Texte' }).click();
  await expect.poll(async () => readFile(join(vault, 'Projets', 'page.md'), 'utf8')).toContain('{name: Priorité, type: text}');
  await base.getByRole('row').filter({ hasText: 'Site perso' }).hover();
  await base.getByRole('button', { name: 'Mettre la ligne Site perso à la corbeille' }).click();
  await expect(base.getByRole('row')).toHaveCount(4);
  await expect.poll(() => readFile(join(vault, 'Projets', 'Site perso', 'page.md'), 'utf8').then(() => true, () => false)).toBe(false);
  await fermer(session);
});

test('un champ « choix » : valeur créée en la tapant, liste réglée depuis l’en-tête', async () => {
  const session = await lancer(await preparer());
  const { page, vault } = session;
  await ouvrirPage(page, 'Projets');
  await actionDePage(page, 'Passer en base de données');
  await page.getByRole('dialog', { name: 'Passer en base de données' }).getByRole('button', { name: /^Une page par ligne/ }).click();
  const base = page.getByRole('region', { name: 'Base de données' });
  await base.getByRole('button', { name: 'Nouvelle colonne' }).last().click();
  await page.getByRole('textbox', { name: 'Nom du champ' }).fill('Type');
  await page.getByRole('combobox', { name: 'Type du champ' }).selectOption('choix');
  await base.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await expect.poll(() => readFile(join(vault, 'Projets', 'page.md'), 'utf8')).toContain('{name: Type, type: select, options: []}');

  // Une valeur tapée qui n'est pas dans la liste s'y ajoute.
  await base.getByRole('button', { name: 'Type de Site perso : aucun' }).click();
  await page.keyboard.type('Code');
  await page.keyboard.press('Enter');
  await expect(base.getByRole('button', { name: 'Type de Site perso : Code' })).toBeVisible();
  await expect.poll(() => readFile(join(vault, 'Projets', 'page.md'), 'utf8')).toContain('options: [{name: Code}]');

  // Dans la liste d'une autre ligne : sans accents, « cod » trouve Code ; Entrée le retient.
  const autre = base.getByRole('button', { name: /^Type de (?!Site perso)/ }).first();
  await autre.click();
  await page.keyboard.type('cod');
  await expect(page.getByRole('option')).toHaveText(['Code', 'Créer « cod »', 'Aucun']);
  await page.keyboard.press('Enter');
  await expect(base.getByRole('button', { name: /: Code$/ })).toHaveCount(2);

  // Valeurs possibles depuis le menu de l'en-tête : ajouter, colorer, renommer partout.
  await base.getByRole('button', { name: 'Actions du champ Type' }).click();
  await page.getByRole('menuitem', { name: 'Valeurs possibles…' }).click();
  const valeurs = page.getByRole('dialog', { name: 'Valeurs possibles de Type' });
  await valeurs.getByRole('textbox', { name: 'Nouvelle valeur' }).fill('Autre');
  await page.keyboard.press('Enter');
  await valeurs.getByRole('button', { name: 'Couleur de Code' }).click();
  await valeurs.getByRole('button', { name: 'Rouge' }).click();
  await expect.poll(() => readFile(join(vault, 'Projets', 'page.md'), 'utf8')).toContain('options: [{name: Code, color: error}, {name: Autre}]');
  await valeurs.getByRole('button', { name: 'Renommer Code' }).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('Dev');
  await page.keyboard.press('Enter');
  await expect(base.getByRole('button', { name: /: Dev$/ })).toHaveCount(2);
  await expect.poll(() => readFile(join(vault, 'Projets', 'Site perso', 'page.md'), 'utf8')).toContain('  Type: Dev\n');

  // Retirer une valeur vide les lignes qui l'avaient.
  await valeurs.getByRole('button', { name: 'Retirer Dev' }).click();
  await expect(base.getByRole('button', { name: /: Dev$/ })).toHaveCount(0);
  await expect.poll(() => readFile(join(vault, 'Projets', 'Site perso', 'page.md'), 'utf8')).not.toContain('Type:');
  await fermer(session);
});

test('une base sans pages : lignes dans le tableau de la page, conversion dans les deux sens', async () => {
  const preparation = await preparer();
  const { vault } = preparation;
  // Une sous-page dont le texte ne tient pas dans une cellule : elle restera une page.
  await mkdir(join(vault, 'Projets', 'Garmin'));
  await writeFile(join(vault, 'Projets', 'Garmin', 'page.md'), '---\nid: 0199a0b0-0000-7000-8000-0000000000a1\ntitle: Garmin\ncreated: 2026-01-01T00:00:00.000Z\nupdated: 2026-01-01T00:00:00.000Z\n---\nUn.\n\nDeux.\n');
  const session = await lancer(preparation);
  const { page } = session;
  await ouvrirPage(page, 'Courses');
  await ouvrirPage(page, 'Projets');
  await actionDePage(page, 'Passer en base de données');
  await page.getByRole('dialog', { name: 'Passer en base de données' }).getByRole('button', { name: /^Lignes sans page/ }).click();
  const base = page.getByRole('region', { name: 'Base de données' });
  await expect.poll(() => readFile(join(vault, 'Projets', 'page.md'), 'utf8')).toContain('  rows: table');
  // Les sous-pages restent des pages, montrées sous le tableau.
  await expect(base.getByRole('button', { name: 'Garmin' })).toBeVisible();

  // Une ligne, une sous-ligne, une valeur, un titre changé : tout va dans le tableau de la page.
  await base.getByRole('button', { name: 'Nouvelle ligne' }).click();
  await page.keyboard.type('Vélo');
  await page.keyboard.press('Enter');
  await base.getByRole('row').filter({ hasText: 'Vélo' }).hover();
  await base.getByRole('button', { name: 'Ajouter une sous-ligne à Vélo' }).click();
  await page.keyboard.type('Chaîne');
  await page.keyboard.press('Enter');
  await base.getByRole('button', { name: /^État de Chaîne/ }).click();
  await page.getByRole('menuitem', { name: 'Fait' }).click();
  await base.getByRole('button', { name: 'Vélo', exact: true }).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('Vélo de route');
  await page.keyboard.press('Enter');
  await attendreEnregistrement(page);
  await expect.poll(() => lireCorps(vault, 'Projets')).toMatch(/\| Vélo de route +\| +\|\n\| ↳ Chaîne +\| Fait +\|/);
  expect(await readFile(join(vault, 'Projets', 'page.md'), 'utf8')).not.toContain('notes://');

  // Retirer une ligne se rattrape : « Annuler », ou Ctrl+Z hors d'un champ.
  await base.getByRole('row').filter({ hasText: 'Vélo de route' }).hover();
  await base.getByRole('button', { name: 'Retirer la ligne Vélo de route' }).click();
  await expect(base.getByRole('button', { name: 'Vélo de route', exact: true })).toHaveCount(0);
  await base.getByRole('button', { name: 'Annuler' }).click();
  await expect(base.getByRole('button', { name: /^État de Chaîne : Fait/ })).toBeVisible();
  await base.getByRole('row').filter({ hasText: 'Chaîne' }).hover();
  await base.getByRole('button', { name: 'Retirer la ligne Chaîne' }).click();
  await expect(base.getByRole('status')).toContainText('Ligne « Chaîne » retirée.');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(base.getByRole('button', { name: /^État de Chaîne : Fait/ })).toBeVisible();
  await expect(base.getByRole('status')).toHaveCount(0);

  // Vers une page par ligne : chaque ligne devient une sous-page avec ses valeurs.
  await actionDePage(page, 'Paramètres de la base');
  const parametres = page.getByRole('dialog', { name: 'Paramètres de la base' });
  await parametres.getByRole('button', { name: /^Une page par ligne/ }).click();
  await expect(parametres).toContainText('2 lignes deviennent des pages');
  await parametres.getByRole('button', { name: 'Convertir' }).click();
  await expect.poll(() => readFile(join(vault, 'Projets', 'Vélo de route', 'Chaîne', 'page.md'), 'utf8').catch(() => '')).toContain('props:\n  État: Fait\n');
  await expect.poll(() => readFile(join(vault, 'Projets', 'page.md'), 'utf8')).not.toContain('rows: table');
  await expect(base.getByRole('button', { name: /^État de Chaîne : Fait/ })).toBeVisible();

  // Retour sans pages : les pages qui tiennent dans une ligne passent, leur texte en Description ; Garmin reste.
  await parametres.getByRole('button', { name: /^Lignes sans page/ }).click();
  await expect(parametres).toContainText('Restent des pages, leur texte ne tenant pas dans une cellule : Garmin');
  await parametres.getByRole('button', { name: 'Convertir' }).click();
  await expect.poll(() => readFile(join(vault, 'Projets', 'page.md'), 'utf8')).toContain('    - {name: Description, type: text}\n');
  await attendreEnregistrement(page);
  await expect.poll(() => lireCorps(vault, 'Projets')).toMatch(/\| Refonte du NAS +\| +\| Passer le NAS en SMB 3 chiffré\. +\|/);
  await expect.poll(() => readFile(join(vault, 'Projets', 'Refonte du NAS', 'page.md'), 'utf8').then(() => true, () => false)).toBe(false);
  expect(await readFile(join(vault, 'Projets', 'Garmin', 'page.md'), 'utf8')).toContain('Deux.');
  await parametres.getByRole('button', { name: 'Fermer' }).click();
  await fermer(session);
});

test("un titre de ligne trop long revient à la ligne au lieu d'être rogné", async () => {
  const session = await lancer(await preparer());
  const { page } = session;
  await ouvrirPage(page, 'Projets');
  await actionDePage(page, 'Passer en base de données');
  await page.getByRole('dialog', { name: 'Passer en base de données' }).getByRole('button', { name: /^Une page par ligne/ }).click();
  const base = page.getByRole('region', { name: 'Base de données' });
  const titre = 'Un titre de ligne vraiment très long qui ne tient pas dans la largeur de la colonne Page et doit revenir à la ligne';
  await base.getByRole('button', { name: 'Nouvelle ligne' }).click();
  await page.keyboard.type(titre);
  await page.keyboard.press('Enter');
  const texte = base.getByText(titre, { exact: true });
  await expect(texte).toBeVisible();
  // Un titre court tient sur une ligne ; le long en prend au moins deux.
  const court = await base.getByText('Site perso', { exact: true }).boundingBox();
  const long = await texte.boundingBox();
  expect(long!.height).toBeGreaterThan(court!.height * 1.5);
  await fermer(session);
});

test('une base en liste : case liée à l’état, lignes enchaînées par Entrée, valeurs sous le titre', async () => {
  const session = await lancer(await preparer());
  const { page, vault } = session;
  await ouvrirPage(page, 'Projets');
  await actionDePage(page, 'Passer en base de données');
  await page.getByRole('dialog', { name: 'Passer en base de données' }).getByRole('button', { name: /^Une page par ligne/ }).click();
  const base = page.getByRole('region', { name: 'Base de données' });
  await expect(base).toBeVisible();

  await actionDePage(page, 'Paramètres de la base');
  const parametres = page.getByRole('dialog', { name: 'Paramètres de la base' });
  await parametres.getByRole('button', { name: /^Liste/ }).click();
  await page.keyboard.press('Escape');
  await expect.poll(() => readFile(join(vault, 'Projets', 'page.md'), 'utf8')).toContain('  view: list');
  await expect(base.getByRole('row')).toHaveCount(0);
  await expect(base.getByRole('list', { name: 'Lignes de la base' })).toBeVisible();

  // Entrée crée la ligne et rouvre un champ pour la suivante ; Entrée sur un champ vide le ferme.
  await base.getByRole('button', { name: 'Nouvelle ligne' }).click();
  await page.keyboard.type('Premier');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Second avec un titre assez long pour qu’il revienne à la ligne dans la liste');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(base.getByRole('textbox')).toHaveCount(0);
  await expect(base.getByRole('checkbox', { name: 'Premier : fait' })).not.toBeChecked();
  await expect(base.getByRole('button', { name: /^Second avec un titre/ })).toBeVisible();

  // La case écrit le dernier état de la liste, et le décoche rend le premier.
  await base.getByRole('checkbox', { name: 'Premier : fait' }).click();
  await expect(base.getByRole('checkbox', { name: 'Premier : fait' })).toBeChecked();
  await expect.poll(() => readFile(join(vault, 'Projets', 'Premier', 'page.md'), 'utf8')).toContain('État: Fait');
  await base.getByRole('checkbox', { name: 'Premier : fait' }).click();
  await expect.poll(() => readFile(join(vault, 'Projets', 'Premier', 'page.md'), 'utf8')).toContain('État: À faire');

  // Les autres champs se montrent sous le titre, vides seulement au survol.
  await base.getByRole('button', { name: 'Nouvelle colonne' }).click();
  await page.getByRole('textbox', { name: 'Nom du champ' }).fill('Priorité');
  await page.getByRole('combobox', { name: 'Type du champ' }).selectOption('nombre');
  await base.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await base.getByRole('button', { name: /^Priorité de Second/ }).click();
  await page.keyboard.type('2');
  await page.keyboard.press('Enter');
  await expect(base.getByRole('button', { name: /^Priorité de Second.* : 2$/ })).toHaveText('2');
  // Les étiquettes (choix) se mettent à droite du titre, sur sa ligne.
  await base.getByRole('button', { name: 'Nouvelle colonne' }).click();
  await page.getByRole('textbox', { name: 'Nom du champ' }).fill('Type');
  await page.getByRole('combobox', { name: 'Type du champ' }).selectOption('choix');
  await base.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await base.getByRole('button', { name: /^Type de Premier/ }).click();
  await page.keyboard.type('Code');
  await page.keyboard.press('Enter');
  const titrePremier = await base.getByRole('button', { name: 'Premier', exact: true }).boundingBox();
  const etiquette = await base.getByText('Code', { exact: true }).boundingBox();
  expect(etiquette!.x).toBeGreaterThan(titrePremier!.x + titrePremier!.width);
  expect(Math.abs(etiquette!.y - titrePremier!.y)).toBeLessThan(titrePremier!.height);
  // Retour au tableau.
  await actionDePage(page, 'Paramètres de la base');
  await page.getByRole('dialog', { name: 'Paramètres de la base' }).getByRole('button', { name: /^Tableau/ }).click();
  await page.keyboard.press('Escape');
  await expect(base.getByRole('columnheader', { name: 'Page' })).toBeVisible();
  expect(await readFile(join(vault, 'Projets', 'page.md'), 'utf8')).not.toContain('view: list');
  await fermer(session);
});
