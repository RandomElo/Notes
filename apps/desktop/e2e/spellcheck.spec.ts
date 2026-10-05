import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { attendreEnregistrement, editeur, fermer, lancer, lireCorps, ouvrirPage, preparer } from './app';

// Critère de J11 : aucune latence perceptible à la frappe. Plus le soulignement, la bulle, le dictionnaire,
// l'exclusion du code, la vérification bloc par bloc et le service absent.

const taper = (page: Page, texte: string) => page.keyboard.type(texte, { delay: 15 });

interface FauxLanguageTool {
  adresse: string;
  /** Textes reçus, dans l'ordre (balisage compris, comme LanguageTool les voit). */
  recus: string[];
  /** Délai avant chaque réponse. */
  delaiMs: number;
  serveur: Server;
}

/**
 * Faux LanguageTool : lit le texte annoté comme le vrai (le balisage compte
 * dans les positions mais n'est jamais vérifié), souligne « fesait »,
 * « Sequelize » et « a » devant « vélo ».
 */
async function fauxLanguageTool(): Promise<FauxLanguageTool> {
  const faux: FauxLanguageTool = { adresse: '', recus: [], delaiMs: 0, serveur: createServer() };
  faux.serveur.on('request', (requete, reponse) => {
    let corps = '';
    requete.on('data', (morceau: Buffer) => (corps += morceau.toString()));
    requete.on('end', () => {
      const formulaire = new URLSearchParams(corps);
      const { annotation } = JSON.parse(formulaire.get('data') ?? '{"annotation":[]}') as { annotation: ({ text: string } | { markup: string })[] };
      let complet = '';
      const matches: unknown[] = [];
      const regles: [RegExp, string, string, string[]][] = [
        [/\bfesait\b/g, 'FR_SPELLING_RULE', 'misspelling', ['faisait', 'fessait']],
        [/\bSequelize\b/g, 'FR_SPELLING_RULE', 'misspelling', ['Séquelle']],
        [/\ba(?= vélo)/g, 'A_ACCENT', 'grammar', ['à']],
      ];
      for (const morceau of annotation) {
        if ('text' in morceau) {
          for (const [motif, id, nature, suggestions] of regles) {
            for (const trouve of morceau.text.matchAll(motif)) {
              matches.push({
                message: nature === 'misspelling' ? 'Faute de frappe possible.' : 'Il manque peut-être un accent.',
                offset: complet.length + trouve.index,
                length: trouve[0].length,
                replacements: suggestions.map((value) => ({ value })),
                rule: { id, issueType: nature },
              });
            }
          }
          complet += morceau.text;
        } else {
          complet += morceau.markup;
        }
      }
      faux.recus.push(complet);
      setTimeout(() => {
        reponse.setHeader('Content-Type', 'application/json');
        reponse.end(JSON.stringify({ matches }));
      }, faux.delaiMs);
    });
  });
  await new Promise<void>((resoudre) => faux.serveur.listen(0, '127.0.0.1', resoudre));
  faux.adresse = `http://127.0.0.1:${(faux.serveur.address() as AddressInfo).port}`;
  return faux;
}

/** Va à la fin de la page, dans un paragraphe neuf. */
async function finDePage(page: Page): Promise<void> {
  await editeur(page).click();
  await page.waitForTimeout(100);
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
}

const barreDeStatut = (page: Page) => page.locator('footer');

test('fautes soulignées bloc par bloc, corrigées, ignorées ou ajoutées au dictionnaire, sans gêner la frappe', async () => {
  const faux = await fauxLanguageTool();
  const preparation = await preparer();
  const session = await lancer(preparation, [], { NOTES_LANGUAGETOOL_ADRESSE: faux.adresse });
  const { page, vault } = session;

  await ouvrirPage(page, 'Courses');
  // À l'ouverture, chaque bloc de texte de la page part une fois.
  await expect.poll(() => faux.recus.length).toBeGreaterThan(0);
  await expect(barreDeStatut(page)).toContainText('Aucune faute');

  // Le code en ligne n'est pas vérifié : seul le premier « fesait » est souligné.
  await finDePage(page);
  // Sortir de la liste modifie son dernier élément, qui repart : on attend, puis on ne compte que la frappe.
  await page.waitForTimeout(1_200);
  faux.recus.length = 0;
  await taper(page, 'Il fesait beau, je vais au marché a vélo avec `fesait` ');
  const orthographe = editeur(page).locator('.faute-orthographe');
  const grammaire = editeur(page).locator('.faute-grammaire');
  await expect(orthographe).toHaveText(['fesait']);
  await expect(grammaire).toHaveText(['a']);
  await expect(barreDeStatut(page)).toContainText('2 fautes');
  // Seul le bloc modifié est parti, avec le code dedans comme balisage.
  expect(new Set(faux.recus)).toEqual(new Set(['Il fesait beau, je vais au marché a vélo avec fesait ']));

  // Un clic sur le mot ouvre la bulle ; une suggestion le remplace.
  await orthographe.click();
  const bulle = page.getByRole('dialog', { name: "Faute d'orthographe" });
  await expect(bulle).toContainText('Faute de frappe possible.');
  await bulle.getByRole('button', { name: 'faisait', exact: true }).click();
  await expect(bulle).toHaveCount(0);
  await expect(editeur(page)).toContainText('Il faisait beau');
  await expect(orthographe).toHaveCount(0);
  await expect(barreDeStatut(page)).toContainText('1 faute');

  // « Ignorer » : la remarque disparaît sans nouvelle vérification, et reste écartée pour toujours (fichier synchronisé).
  await grammaire.click();
  await page.getByRole('dialog', { name: 'Remarque de grammaire' }).getByRole('button', { name: 'Ignorer' }).click();
  await expect(grammaire).toHaveCount(0);
  await expect(barreDeStatut(page)).toContainText('Aucune faute');
  await expect.poll(() => readFile(join(vault, '.notes', 'spelling-ignored.txt'), 'utf8').catch(() => '')).toBe('A_ACCENT a\n');

  // « Ajouter au dictionnaire » : le mot n'est plus souligné, et le fichier du dossier des notes le garde.
  await page.keyboard.press('End');
  await taper(page, 'et Sequelize.');
  await expect(orthographe).toHaveText(['Sequelize']);
  await orthographe.click();
  await page.getByRole('button', { name: 'Ajouter « Sequelize » au dictionnaire' }).click();
  await expect(orthographe).toHaveCount(0);
  expect(await readFile(join(vault, '.notes', 'dictionary.txt'), 'utf8')).toBe('Sequelize\n');

  // Échap ferme la bulle sans toucher au texte.
  await page.keyboard.press('End');
  await taper(page, ' Encore fesait.');
  await orthographe.click();
  await expect(bulle).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(bulle).toHaveCount(0);
  await expect(orthographe).toHaveText(['fesait']);

  // Les soulignements ne sont que de l'affichage : le fichier n'en garde rien.
  await attendreEnregistrement(page);
  expect(await lireCorps(vault, 'Courses')).toContain('Il faisait beau, je vais au marché a vélo avec `fesait` et Sequelize. Encore fesait.');

  // Critère : un serveur lent ne ralentit pas la frappe. Chaque réponse met 1,5 s, la frappe reste au rythme du clavier.
  faux.delaiMs = 1_500;
  await page.keyboard.press('Enter');
  const debut = Date.now();
  await taper(page, 'Une phrase tapée pendant que le serveur traîne, fesait compris.');
  const duree = Date.now() - debut;
  expect(duree).toBeLessThan(63 * 15 + 1_200);
  await expect(editeur(page)).toContainText('Une phrase tapée pendant que le serveur traîne, fesait compris.');
  await expect(orthographe).toHaveCount(2, { timeout: 5_000 });

  // Serveur arrêté : rien n'est souligné de plus, l'édition et l'enregistrement continuent.
  await new Promise<void>((resoudre) => faux.serveur.close(() => resoudre()));
  faux.serveur.closeAllConnections();
  await page.keyboard.press('Enter');
  await taper(page, 'Toujours fesait sans serveur.');
  await page.waitForTimeout(1_500);
  await expect(orthographe).toHaveCount(2);
  await attendreEnregistrement(page);
  expect(await lireCorps(vault, 'Courses')).toContain('Toujours fesait sans serveur.');

  await fermer(session);
});

test('liste des fautes depuis la barre de statut : chaque faute dans sa phrase, corrigée sans quitter la liste', async () => {
  const faux = await fauxLanguageTool();
  const session = await lancer(await preparer(), [], { NOTES_LANGUAGETOOL_ADRESSE: faux.adresse });
  const { page, vault } = session;

  await ouvrirPage(page, 'Courses');
  await finDePage(page);
  await taper(page, 'Bonjour. Il fesait beau hier. Je vais au marché a vélo.');
  await page.keyboard.press('Enter');
  await taper(page, 'On utilise Sequelize ici.');
  await expect(barreDeStatut(page)).toContainText('3 fautes');

  await barreDeStatut(page).getByRole('button', { name: /3 fautes/ }).click();
  const liste = page.getByRole('dialog', { name: 'Fautes de la page' });
  await expect(liste.getByRole('heading')).toHaveText('3 fautes dans la page');
  const lignes = liste.locator('li[data-faute]');
  // Chaque faute dans sa phrase seulement, dans l'ordre de la page.
  await expect(lignes.locator('button[title="Aller au mot dans la page"]')).toHaveText(['… Il fesait beau hier. …', '… Je vais au marché a vélo.', 'On utilise Sequelize ici.']);
  // Le focus est sur la première suggestion de la première faute.
  await expect(lignes.nth(0).getByRole('button', { name: 'faisait', exact: true })).toBeFocused();

  // Corriger : la faute sort de la liste, le focus passe à la suivante.
  await page.keyboard.press('Enter');
  await expect(liste.getByRole('heading')).toHaveText('2 fautes dans la page');
  await expect(lignes.nth(0).getByRole('button', { name: 'à', exact: true })).toBeFocused();
  await expect(editeur(page)).toContainText('Il faisait beau hier.');

  // Flèche bas : la faute suivante ; « Ajouter au dictionnaire » la retire.
  await page.keyboard.press('ArrowDown');
  await expect(lignes.nth(1).getByRole('button', { name: 'Séquelle', exact: true })).toBeFocused();
  await lignes.nth(1).getByRole('button', { name: 'Ajouter au dictionnaire' }).click();
  await expect(liste.getByRole('heading')).toHaveText('1 faute dans la page');

  // Un clic sur la phrase mène au mot dans la page, liste fermée.
  await lignes.nth(0).locator('button[title="Aller au mot dans la page"]').click();
  await expect(liste).toHaveCount(0);
  expect(await page.evaluate(() => (globalThis as unknown as { getSelection(): { toString(): string } }).getSelection().toString())).toBe('a');

  // Rouverte : « Ignorer » vide la liste ; Échap la ferme.
  await barreDeStatut(page).getByRole('button', { name: /1 faute/ }).click();
  await liste.getByRole('button', { name: 'Ignorer' }).click();
  await expect(liste).toContainText('Plus aucune faute dans la page.');
  await page.keyboard.press('Escape');
  await expect(liste).toHaveCount(0);
  await expect(barreDeStatut(page)).toContainText('Aucune faute');

  await attendreEnregistrement(page);
  expect(await lireCorps(vault, 'Courses')).toContain('Bonjour. Il faisait beau hier. Je vais au marché a vélo.');
  faux.serveur.close();
  faux.serveur.closeAllConnections();
  await fermer(session);
});

test("sans LanguageTool installé : les réglages proposent l'installation, rien n'est souligné, l'édition marche", async () => {
  const session = await lancer(await preparer());
  const { page, vault } = session;

  await ouvrirPage(page, 'Courses');
  await finDePage(page);
  await taper(page, 'Il fesait beau.');
  await attendreEnregistrement(page);
  expect(await lireCorps(vault, 'Courses')).toContain('Il fesait beau.');
  await expect(editeur(page).locator('.faute-orthographe')).toHaveCount(0);
  await expect(barreDeStatut(page)).not.toContainText('faute');

  await page.keyboard.press('Control+,');
  const section = page.getByRole('region', { name: 'Correction orthographique' });
  await expect(section).toContainText("LanguageTool n'est pas installé");
  await expect(section).toContainText('2,1 Go');
  await expect(section.getByRole('button', { name: 'Installer la correction orthographique' })).toBeVisible();

  await fermer(session);
});
