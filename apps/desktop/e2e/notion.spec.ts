import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { strToU8, zipSync } from 'fflate';
import { editeur, fermer, lancer, ligne, lireCorps, preparer, rubrique, titreDePage } from './app';

// Import de Notion (docs/spec/import-notion.md) : un export HTML en deux morceaux, dont un dans un .zip.

const a = 'a'.repeat(32);
const b = 'b'.repeat(32);
const page = (titre: string, corps: string, entete = ''): string =>
  `<html><body><article class="page sans"><header>${entete}<h1 class="page-title">${titre}</h1></header><div class="page-body">${corps}</div></article></body></html>`;

test('un export Notion s’importe depuis les réglages, base par base', async () => {
  const preparation = await preparer();
  const base = `<div class="collection-content"><h4 class="collection-title">Lectures</h4><table class="collection-content"><thead><tr><th>Nom</th></tr></thead><tbody><tr><td class="cell-title"><a href="Cours%20${a}/Livre%20${b}.html">Livre</a></td></tr></tbody></table></div>`;
  const morceau = zipSync({
    [`Cours ${a}.html`]: strToU8(page('Cours', `<figure><div class="source"><a href="Cours%20${a}/plan.pdf">plan.pdf</a></div></figure><ul class="to-do-list"><li><div class="checkbox checkbox-off"></div> <span>réviser</span></li></ul>${base}`, '<div class="page-header-icon"><span class="icon">🎓</span></div>')),
    [`Cours ${a}/Livre ${b}.html`]: strToU8(page('Livre', '<p>Un bon livre</p>')),
    [`Cours ${a}/plan.pdf`]: strToU8('%PDF-1.7\nplan'),
  });
  const archive = join(preparation.profil, 'Export-Part-1.zip');
  await writeFile(archive, zipSync({ 'Export-Part-1.zip': morceau }));

  const session = await lancer(preparation);
  const { page: fenetre, application, vault } = session;
  await application.evaluate(({ dialog }, chemin) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [chemin] })) as typeof dialog.showOpenDialog;
  }, archive);

  await fenetre.getByRole('button', { name: 'Réglages', exact: true }).click();
  await rubrique(fenetre, 'Import Notion');
  await fenetre.getByRole('button', { name: "Choisir l'export (.zip)" }).click();
  // Le choix des pages : tout est coché, le PDF est annoncé ; la base se règle dans l'aperçu de sa page.
  const choixDesPages = fenetre.getByRole('dialog', { name: 'Pages à importer' });
  await expect(choixDesPages.getByRole('status')).toHaveText('2 pages cochées sur 2 · 1 PDF inclus (1 Ko)');
  await choixDesPages.getByRole('button', { name: 'Cours', exact: true }).click();
  await expect(choixDesPages.getByRole('region', { name: 'Aperçu' })).toContainText('réviser');
  const choix = choixDesPages.getByRole('combobox', { name: 'Que devient « Lectures »' });
  await expect(choix).toHaveValue('tableau-et-pages');
  await choix.selectOption('tableau');
  await choixDesPages.getByRole('button', { name: 'Importer', exact: true }).click();
  await expect(fenetre.getByRole('status').filter({ hasText: 'importée' })).toHaveText('1 page importée.');

  // La page est dans l'arborescence, avec son icône ; la ligne de la base, montrée en tableau seul, n'est pas une page.
  await expect(ligne(fenetre, 'Cours')).toBeVisible();
  await expect(ligne(fenetre, 'Livre')).toHaveCount(0);
  expect(await lireCorps(vault, 'Cours')).toBe('[📎 plan.pdf](assets/plan.pdf)\n\n- [ ] réviser\n\n### Lectures\n\n| Nom   |\n| ----- |\n| Livre |\n');
  expect(await readFile(join(vault, 'Cours', 'page.md'), 'utf8')).toContain('icon: 🎓\n');
  await ligne(fenetre, 'Cours').click();
  await expect(titreDePage(fenetre)).toHaveText('Cours');

  // Le PDF joint s'ouvre dans la visionneuse du système (remplacée ici pour noter le chemin).
  await application.evaluate(({ shell }) => {
    const ouverts: string[] = [];
    (globalThis as unknown as { ouverts: string[] }).ouverts = ouverts;
    shell.openPath = async (chemin: string) => {
      ouverts.push(chemin);
      return '';
    };
  });
  await editeur(fenetre).getByRole('link', { name: '📎 plan.pdf' }).click();
  await expect.poll(() => application.evaluate(() => (globalThis as unknown as { ouverts: string[] }).ouverts)).toEqual([join(vault, 'Cours', 'assets', 'plan.pdf')]);
  await fermer(session);
});
