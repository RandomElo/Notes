import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import { actionDePage, fermer, lancer, ligne, ouvrirPage, preparer } from './app';

// Critère de J9 : 20 pages en PDF sans coupure incorrecte. Plus les exports Markdown, HTML et ZIP.

const projets = '0199a0b0-0000-7000-8000-000000000002';
const parties = 34;

/** Une longue page technique : titres, paragraphes, code, tableaux, callouts, listes, images, repérables dans le PDF. */
function pageLongue(): string {
  const morceaux: string[] = [];
  for (let k = 1; k <= parties; k += 1) {
    morceaux.push(`## Partie ${k}`);
    morceaux.push(
      `Paragraphe de la partie ${k}. ` +
        'Le NAS garde une copie de chaque page, la sync passe toutes les dix secondes et ne remplace jamais une version modifiée ailleurs sans la garder à côté. '.repeat(3),
    );
    morceaux.push(`### Sous-titre ${k}`);
    morceaux.push(['```ts', `// BLOC-${k}-DEBUT`, ...Array.from({ length: 10 }, (_v, ligne) => `const valeur${ligne} = calculer(${ligne}, 'partie ${k}');`), `// BLOC-${k}-FIN`, '```'].join('\n'));
    morceaux.push(['| Colonne A | Colonne B |', '| --- | --- |', ...Array.from({ length: 5 }, (_v, rang) => `| T-${k}-${rang} | valeur ${rang} |`)].join('\n'));
    morceaux.push(['```notes-callout', 'type: warning', 'text: |-', `  CALLOUT-${k}-DEBUT couper le **wifi** avant de toucher au routeur.`, '', `  Deuxième paragraphe. CALLOUT-${k}-FIN`, '```'].join('\n'));
    morceaux.push(`Avant de continuer :\n\n* [x] Sauvegarde faite ${k}\n* [ ] Relecture ${k}`);
    morceaux.push(`- un point de la partie ${k}\n- un autre point, avec [Projets](notes://${projets})\n- [Exemple](https://exemple.fr "mention")`);
    if (k % 6 === 0) {
      morceaux.push(`![Schéma ${k}](assets/schema.png#largeur=50 "Légende ${k}")`);
    }
  }
  return `---\nid: 0199a0b0-0000-7000-8000-0000000000e1\ntitle: Export long\ncreated: 2026-10-04T08:00:00.000Z\nupdated: 2026-10-04T08:00:00.000Z\nicon: 🧪\n---\n${morceaux.join('\n\n')}\n`;
}

async function preparerAvecPageLongue(): Promise<{ vault: string; profil: string }> {
  const dossiers = await preparer();
  const page = join(dossiers.vault, 'Projets', 'Export long');
  await mkdir(join(page, 'assets'), { recursive: true });
  await writeFile(join(page, 'page.md'), pageLongue());
  await copyFile(join(dossiers.vault, 'Bienvenue', 'assets', 'schema.png'), join(page, 'assets', 'schema.png'));
  return dossiers;
}

/**
 * La boîte « Enregistrer sous » répond ce chemin, sans s'ouvrir. Le fichier exporté n'est pas ouvert
 * dans un vrai programme : son chemin est seulement noté (`globalThis.ouverts`).
 */
async function enregistrerSous(application: ElectronApplication, chemin: string): Promise<void> {
  await application.evaluate(({ dialog, shell }, cible) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: cible })) as typeof dialog.showSaveDialog;
    const notes = globalThis as unknown as { ouverts?: string[] };
    notes.ouverts ??= [];
    shell.openPath = (async (ouvert: string) => {
      notes.ouverts?.push(ouvert);
      return '';
    }) as typeof shell.openPath;
  }, chemin);
}

/** Fichiers que l'application a demandé d'ouvrir après un export. */
async function fichiersOuverts(application: ElectronApplication): Promise<string[]> {
  return application.evaluate(() => (globalThis as unknown as { ouverts?: string[] }).ouverts ?? []);
}

async function exporter(page: Page, format: string, reglages: (page: Page) => Promise<void> = async () => undefined): Promise<void> {
  await actionDePage(page, 'Exporter la page');
  const fenetre = page.getByRole('dialog', { name: 'Exporter la page' });
  await fenetre.getByRole('button', { name: /^Format : / }).click();
  await fenetre.getByRole('option', { name: format, exact: true }).click();
  await reglages(page);
  await fenetre.getByRole('button', { name: 'Exporter', exact: true }).click();
  await fenetre.getByText(/^Exporté : /).waitFor({ timeout: 60_000 });
  await page.keyboard.press('Escape');
  await fenetre.waitFor({ state: 'detached' });
}

/** Texte de chaque page du PDF (pdftotext, s'il est installé), sans le pied de page. */
function pagesDuPdf(fichier: string, nombre: number): string[][] | null {
  try {
    execFileSync('pdftotext', ['-v'], { stdio: 'ignore' });
  } catch {
    return null;
  }
  return Array.from({ length: nombre }, (_v, index) =>
    execFileSync('pdftotext', ['-f', String(index + 1), '-l', String(index + 1), '-layout', fichier, '-'], { encoding: 'utf8' })
      .split('\n')
      .map((ligneDuPdf) => ligneDuPdf.trim())
      .filter((ligneDuPdf) => ligneDuPdf !== '' && !/^Export long\s+\d+ \/ \d+$/.test(ligneDuPdf)),
  );
}

test('une longue page en PDF : plus de 20 pages, aucune coupure incorrecte', async () => {
  const session = await lancer(await preparerAvecPageLongue());
  const sortie = join(session.profil, 'Export long.pdf');
  await enregistrerSous(session.application, sortie);
  await ligne(session.page, 'Projets').locator('button[aria-label="Déplier"]').first().click();
  await ouvrirPage(session.page, 'Export long');
  await exporter(session.page, 'PDF');

  // Le fichier est ouvert dès qu'il est écrit, pour voir le résultat.
  expect(await fichiersOuverts(session.application)).toEqual([sortie]);
  const pdf = await readFile(sortie);
  expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  const nombre = (pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length;
  expect(nombre).toBeGreaterThanOrEqual(20);

  const pages = pagesDuPdf(sortie, nombre);
  test.skip(pages === null, 'pdftotext absent : coupures non vérifiées');
  const lignes = pages as string[][];
  const pageDe = (marque: string): number => lignes.findIndex((texte) => texte.some((ligneDuPdf) => ligneDuPdf.includes(marque)));
  for (let k = 1; k <= parties; k += 1) {
    // Code et callouts entiers sur une page.
    expect(pageDe(`BLOC-${k}-FIN`), `bloc ${k}`).toBe(pageDe(`BLOC-${k}-DEBUT`));
    expect(pageDe(`CALLOUT-${k}-FIN`), `callout ${k}`).toBe(pageDe(`CALLOUT-${k}-DEBUT`));
    // Un tableau sur une seule page, ou son en-tête répété.
    for (let rang = 0; rang < 5; rang += 1) {
      const ici = pageDe(`T-${k}-${rang}`);
      expect(lignes[ici]?.some((ligneDuPdf) => ligneDuPdf.includes('Colonne A')), `tableau ${k}, ligne ${rang}`).toBe(true);
    }
  }
  // La page est longue, avec des sous-parties : le PDF commence par un sommaire.
  expect(lignes[0]).toContain('Sommaire');
  const debut = pageDe('Paragraphe de la partie 1');
  // Aucun titre seul en bas d'une page (le sommaire mis à part, fait de titres).
  lignes.slice(debut).forEach((texte, rang) => {
    const index = rang + debut;
    expect(texte.at(-1) ?? '', `bas de la page ${index + 1}`).not.toMatch(/^(Partie|Sous-titre) \d+$/);
  });
  // Le pied de page : titre et numéro.
  const brut = execFileSync('pdftotext', ['-f', '2', '-l', '2', '-layout', sortie, '-'], { encoding: 'utf8' });
  expect(brut).toMatch(new RegExp(`Export long\\s+2 / ${nombre}`));
  await fermer(session);
});

test('Markdown, page web et archive ZIP avec une page décochée', async () => {
  const session = await lancer(await preparerAvecPageLongue());
  await ligne(session.page, 'Projets').locator('button[aria-label="Déplier"]').first().click();
  await ouvrirPage(session.page, 'Export long');

  const markdown = join(session.profil, 'export.md');
  await enregistrerSous(session.application, markdown);
  await exporter(session.page, 'Markdown');
  const texte = await readFile(markdown, 'utf8');
  expect(texte.startsWith('## Partie 1')).toBe(true);
  expect(texte).toContain('⚠️ CALLOUT-1-DEBUT couper le **wifi**');
  expect(texte).toContain('- un autre point, avec Projets');
  expect(texte).toContain('[Exemple](https://exemple.fr)');
  expect(texte).toContain('*Image : Schéma 6, Légende 6*');
  expect(texte).not.toMatch(/notes:\/\/|notes-callout|^>/m);

  const web = join(session.profil, 'export.html');
  await enregistrerSous(session.application, web);
  await exporter(session.page, 'HTML');
  const html = await readFile(web, 'utf8');
  expect(html).toContain('<title>Export long</title>');
  expect(html).toContain('<header class="export-entete"><span class="export-icone"><span class="mention-emoji">🧪</span></span><h1 class="export-titre">Export long</h1></header>');
  expect(html).toContain('class="export-sommaire"');
  expect(html).toContain('href="#partie-1"');
  expect(html).toContain('src="data:image/png;base64,');
  expect(html).toContain('class="hljs-');
  expect(html).not.toMatch(/notes-asset:|contenteditable|<script/);
  // Une tâche faite garde sa case cochée.
  expect(html).toMatch(/<li data-checked="true"[^>]*>(?:(?!<\/li>).)*<input[^>]*type="checkbox"[^>]*checked=""/s);

  // Archive de « Projets » et de ses sous-pages, en pages web, « Site perso » décochée.
  await ouvrirPage(session.page, 'Projets');
  const archive = join(session.profil, 'export.zip');
  await enregistrerSous(session.application, archive);
  await exporter(session.page, 'Archive ZIP', async (page) => {
    await expect(page.getByText(/^\d+ pages sur \d+\./)).toBeVisible();
    await page.getByRole('list', { name: "Pages de l'archive" }).getByText('Site perso').click();
  });
  const fichiers = unzipSync(new Uint8Array(await readFile(archive)));
  const noms = Object.keys(fichiers);
  expect(noms).toEqual(expect.arrayContaining(['Projets.html', 'Projets/Export long.html', 'Projets/Refonte du NAS.html', 'assets/html/style.css', 'assets/images/schema.png']));
  expect(noms.some((nom) => nom.includes('Site perso'))).toBe(false);
  expect(noms.some((nom) => nom.endsWith('.md'))).toBe(false);
  const longue = strFromU8(fichiers['Projets/Export long.html'] as Uint8Array);
  expect(longue).toContain('<link rel="stylesheet" href="../assets/html/style.css">');
  expect(longue).toContain('src="../assets/images/schema.png"');
  expect(longue).toContain('class="export-navigation"');
  expect(longue).toContain('<a href="../Projets.html"');
  // Une page décochée, sans sous-page gardée, n'est pas non plus dans la navigation.
  expect(longue).not.toContain('Site perso');
  expect(longue).toMatch(/<a class="mention"[^>]*href="\.\.\/Projets\.html"/);
  expect(longue).not.toContain('data:image');
  await fermer(session);
});
