import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { attendreEnregistrement, editeur, fermer, lancer, ligne, lireCorps, lireVault, ouvrirPage, preparer } from './app';

// Critère de sortie de J2 : aller-retour Markdown sans perte, vérifié dans l'application réelle.

test('ouvrir toutes les pages sans rien modifier ne change pas un octet du vault', async () => {
  const session = await lancer(await preparer());
  const avant = await lireVault(session.vault);
  const { page } = session;

  for (const titre of ['Bienvenue', 'Courses', 'Projets', 'Journal']) {
    await ouvrirPage(page, titre);
  }
  // La page Bienvenue contient tous les types de blocs : on vérifie qu'ils sont bien rendus.
  await ouvrirPage(page, 'Bienvenue');
  const contenu = editeur(page);
  await expect(contenu.locator('h1')).toHaveText('Bienvenue dans Notes');
  await expect(contenu.locator('h5')).toHaveText('Code et tableau');
  await expect(contenu.locator('ul[data-type="taskList"] li')).toHaveCount(2);
  await expect(contenu.locator('mark')).toHaveText('surlignage');
  await expect(contenu.locator('pre[data-raw-block]')).toContainText('| Colonne | Autre |');

  // Un clic et un déplacement du curseur ne sont pas des modifications.
  await contenu.locator('h1').click();
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(1500);

  await fermer(session);
  expect(await lireVault(session.vault)).toEqual(avant);
});

test('une frappe est enregistrée, et seul le bloc modifié change dans le fichier', async () => {
  const session = await lancer(await preparer());
  const { page, vault } = session;
  const fichier = join(vault, 'Bienvenue', 'page.md');
  const avant = (await readFile(fichier, 'utf8')).split('\n');

  await ouvrirPage(page, 'Bienvenue');
  await editeur(page).locator('p', { hasText: 'Cette page rassemble' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Ajout de test.');
  await attendreEnregistrement(page);

  const apres = (await readFile(fichier, 'utf8')).split('\n');
  expect(apres.length).toBe(avant.length);
  const changees = apres.flatMap((texte, numero) => (texte === avant[numero] ? [] : [texte]));
  expect(changees).toHaveLength(2);
  expect(changees[0]).toMatch(/^updated: /);
  expect(changees[1]).toBe("Cette page rassemble tous les types de blocs. Elle sert aux essais et aux tests d'aller-retour. Ajout de test.");

  // Après redémarrage, la page se retrouve telle qu'elle a été écrite.
  await fermer(session);
  const relance = await lancer(session);
  await ouvrirPage(relance.page, 'Bienvenue');
  await expect(editeur(relance.page).locator('p', { hasText: 'Ajout de test.' })).toBeVisible();
  await fermer(relance);
  expect((await readFile(fichier, 'utf8')).split('\n')).toEqual(apres);
});

test('les raccourcis de saisie Markdown produisent les bons blocs et le bon fichier', async () => {
  const session = await lancer(await preparer());
  const { page, vault } = session;
  await ouvrirPage(page, 'Projets');
  await editeur(page).click();

  const taper = (texte: string) => page.keyboard.type(texte, { delay: 15 });
  const entree = (fois = 1) => page.keyboard.press('Enter').then(async () => {
    for (let i = 1; i < fois; i++) {
      await page.keyboard.press('Enter');
    }
  });

  await taper('# Titre un');
  await entree();
  await taper('##### Titre cinq');
  await entree();
  await taper("Du **gras**, de l'*italique*, du ~~barré~~, du `code`, du ==surlignage== et (**entre parenthèses**).");
  await entree();
  await taper('- puce');
  await entree();
  await taper('autre puce');
  await entree(2);
  await taper('1. premier');
  await entree();
  await taper('second');
  await entree(2);
  await taper('[] à faire');
  await entree();
  await taper('encore');
  await entree(2);
  // Ni citation ni séparateur : « > » et « --- » restent du texte.
  await taper('> pas une citation');
  await entree();
  await taper('---');
  await entree();
  await taper('```ts ');
  await taper('const a = 1;');
  await page.keyboard.press('Control+Enter');
  await taper('fin');
  await attendreEnregistrement(page);

  const contenu = editeur(page);
  await expect(contenu.locator('h1')).toHaveText('Titre un');
  await expect(contenu.locator('h5')).toHaveText('Titre cinq');
  await expect(contenu.locator('strong')).toHaveText(['gras', 'entre parenthèses']);
  await expect(contenu.locator('em')).toHaveText('italique');
  await expect(contenu.locator('s')).toHaveText('barré');
  await expect(contenu.locator('p code')).toHaveText('code');
  await expect(contenu.locator('mark')).toHaveText('surlignage');
  await expect(contenu.locator('ul:not([data-type]) li')).toHaveCount(2);
  await expect(contenu.locator('ol li')).toHaveCount(2);
  await expect(contenu.locator('ul[data-type="taskList"] li')).toHaveCount(2);
  await expect(contenu.locator('blockquote')).toHaveCount(0);
  await expect(contenu.locator('hr')).toHaveCount(0);
  await expect(contenu.locator('pre code')).toHaveText('const a = 1;');

  expect(await lireCorps(vault, 'Projets')).toBe(
    [
      '# Titre un',
      '##### Titre cinq',
      "Du **gras**, de l'*italique*, du ~~barré~~, du `code`, du ==surlignage== et (**entre parenthèses**).",
      '- puce\n- autre puce',
      '1. premier\n2. second',
      '- [ ] à faire\n- [ ] encore',
      '\\> pas une citation',
      '\\---',
      '```ts\nconst a = 1;\n```',
      'fin',
    ].join('\n\n') + '\n',
  );

  // Raccourcis clavier de mise en forme (annexe du README).
  await page.keyboard.press('Enter');
  await page.keyboard.press('Control+b');
  await taper('gras');
  await page.keyboard.press('Control+b');
  await taper(' ');
  await page.keyboard.press('Control+Shift+h');
  await taper('surligné');
  await page.keyboard.press('Control+Shift+h');
  await taper(' ');
  await page.keyboard.press('Control+u');
  await taper('souligné');
  await page.keyboard.press('Control+u');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Control+Alt+3');
  await taper('Titre trois');
  await attendreEnregistrement(page);
  expect(await lireCorps(vault, 'Projets')).toMatch(/\n\nfin\n\n\*\*gras\*\* ==surligné== <u>souligné<\/u>\n\n### Titre trois\n$/);

  // Comme en Markdown : `- [ ] ` fait une tâche, y compris au milieu d'une liste à puces.
  await entree();
  await taper('- [x] faite');
  await entree();
  await taper('autre');
  await entree(2);
  await taper('- puce');
  await entree();
  await taper('[ ] devenue tâche');
  await attendreEnregistrement(page);
  expect(await lireCorps(vault, 'Projets')).toMatch(/\n\n### Titre trois\n\n- \[x\] faite\n- \[ \] autre\n\n\* puce\n\n- \[ \] devenue tâche\n$/);

  // Annuler retire la dernière frappe du fichier aussi.
  await taper(' zzz');
  await attendreEnregistrement(page);
  expect(await lireCorps(vault, 'Projets')).toContain('zzz');
  await page.keyboard.press('Control+z');
  await attendreEnregistrement(page);
  expect(await lireCorps(vault, 'Projets')).not.toContain('zzz');
  await fermer(session);
});

test('cocher une tâche ne change que sa ligne', async () => {
  const session = await lancer(await preparer());
  const { page, vault } = session;
  await ouvrirPage(page, 'Courses');
  await editeur(page).locator('li', { hasText: 'Tomates' }).locator('input[type="checkbox"]').click();
  await attendreEnregistrement(page);
  expect(await lireCorps(vault, 'Courses')).toBe('- [ ] Pâtes\n- [x] Tomates\n- [x] Café\n');
  await fermer(session);
});

test('la case d’une tâche est centrée sur la première ligne de son texte', async () => {
  const session = await lancer(await preparer());
  const { page } = session;
  await ouvrirPage(page, 'Courses');
  const { centreDeLaCase, centreDuTexte } = await editeur(page).evaluate((racine) => {
    const item = racine.querySelector('ul[data-type="taskList"] > li');
    const caseACocher = item?.querySelector('input')?.getBoundingClientRect();
    const plage = racine.ownerDocument.createRange();
    const texte = item?.querySelector('p');
    if (texte) {
      plage.selectNodeContents(texte);
    }
    const ligne = plage.getClientRects()[0];
    return { centreDeLaCase: (caseACocher?.top ?? 0) + (caseACocher?.height ?? 0) / 2, centreDuTexte: (ligne?.top ?? 0) + (ligne?.height ?? 0) / 2 };
  });
  expect(Math.abs(centreDeLaCase - centreDuTexte)).toBeLessThan(1.5);
  await fermer(session);
});

test('changer de page ou fermer la fenêtre enregistre la frappe en attente', async () => {
  const session = await lancer(await preparer());
  const { page, vault } = session;

  await ouvrirPage(page, 'Courses');
  await editeur(page).locator('li', { hasText: 'Café' }).locator('p').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' moulu');
  // Sans attendre l'enregistrement automatique.
  await ligne(page, 'Bienvenue').click();
  await expect.poll(() => lireCorps(vault, 'Courses')).toBe('- [ ] Pâtes\n- [ ] Tomates\n- [x] Café moulu\n');

  await ouvrirPage(page, 'Courses');
  await editeur(page).locator('li', { hasText: 'Pâtes' }).locator('p').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' complètes');
  await fermer(session);
  expect(await lireCorps(vault, 'Courses')).toBe('- [ ] Pâtes complètes\n- [ ] Tomates\n- [x] Café moulu\n');
});

test('une page modifiée par un autre outil est rechargée, et jamais écrasée pendant la frappe', async () => {
  const session = await lancer(await preparer());
  const { page, vault } = session;
  const fichier = join(vault, 'Courses', 'page.md');
  await ouvrirPage(page, 'Courses');

  // Sans frappe en cours : la page affiche la nouvelle version.
  const texte = await readFile(fichier, 'utf8');
  await writeFile(fichier, texte + '- [ ] Ajouté ailleurs\n');
  await expect(editeur(page).locator('li', { hasText: 'Ajouté ailleurs' })).toBeVisible();

  // Pendant la frappe : la version de l'autre outil est gardée à côté, la mienne est enregistrée.
  await editeur(page).locator('li', { hasText: 'Pâtes' }).locator('p').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' fraîches');
  const ailleurs = (await readFile(fichier, 'utf8')) + '- [ ] Conflit\n';
  await writeFile(fichier, ailleurs);
  await expect(page.getByRole('alert')).toContainText('modifiée ailleurs');
  expect(await lireCorps(vault, 'Courses')).toContain('Pâtes fraîches');
  const fichiers = await lireVault(vault);
  const conflit = Object.keys(fichiers).find((chemin) => chemin.startsWith('Courses/page.conflit-'));
  expect(conflit).toBeDefined();
  expect(fichiers[conflit ?? '']).toBe(ailleurs);
  await fermer(session);
});

test('une note venue d’un autre outil est montrée en lecture seule, sans être modifiée', async () => {
  const session = await lancer(await preparer());
  const { page, vault } = session;
  const avant = await lireVault(vault);
  await ligne(page, 'Note externe (non importé)').click();
  await expect(page.getByRole('button', { name: 'Importer dans Notes' })).toBeVisible();
  const apercu = page.locator('.notes-page');
  await expect(apercu.locator('h1')).toHaveText('Note externe');
  await expect(apercu).toHaveAttribute('contenteditable', 'false');
  await fermer(session);
  expect(await lireVault(vault)).toEqual(avant);
});
