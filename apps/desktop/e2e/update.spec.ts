import { chmod, mkdtemp, readFile, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import { argumentsDeLancement, dossierApplication, editeur, lireCorps, ouvrirPage, preparer } from './app';

// Mise à jour locale (`npm run installer`) : l'AppImage remplacée, Notes propose de relancer, puis relance la nouvelle.
// Une fausse AppImage tient lieu de programme : un script qui note ses arguments.

async function installerFausseAppImage(dossier: string, trace: string): Promise<string> {
  const fichier = join(dossier, 'Notes.AppImage');
  const temporaire = join(dossier, '.Notes.AppImage.nouveau');
  await writeFile(temporaire, `#!/bin/sh\necho "relancée $*" >> '${trace}'\n`);
  await chmod(temporaire, 0o755);
  await rename(temporaire, fichier);
  return fichier;
}

test('fenêtre ouverte : la barre de titre propose de relancer, la page est enregistrée, la nouvelle version démarre', async () => {
  const preparation = await preparer();
  const dossier = await mkdtemp(join(tmpdir(), 'notes-installation-'));
  const trace = join(dossier, 'trace.txt');
  const appImage = await installerFausseAppImage(dossier, trace);
  const application = await electron.launch({
    args: argumentsDeLancement(preparation.profil),
    cwd: dossierApplication,
    env: { ...process.env, APPIMAGE: appImage },
  });
  let page = application.windows().find((fenetre) => fenetre.url().startsWith('file:'));
  while (page === undefined) {
    await new Promise((resoudre) => setTimeout(resoudre, 20));
    page = application.windows().find((fenetre) => fenetre.url().startsWith('file:'));
  }
  await page.getByRole('tree').waitFor();
  await expect(page.getByRole('button', { name: /Relancer/ })).toHaveCount(0);

  await installerFausseAppImage(dossier, trace);
  const bouton = page.getByRole('button', { name: /Nouvelle version · Relancer/ });
  await expect(bouton).toBeVisible({ timeout: 10_000 });

  // Une frappe pas encore enregistrée au moment de relancer : elle doit arriver dans le fichier.
  await ouvrirPage(page, 'Courses');
  await editeur(page).click();
  await page.waitForTimeout(100);
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' avant la relance', { delay: 15 });

  const fin = application.waitForEvent('close');
  await bouton.click();
  await fin;
  expect(await lireCorps(preparation.vault, 'Courses')).toContain('avant la relance');
  // Relancée avec les mêmes arguments (le profil).
  await expect.poll(() => readFile(trace, 'utf8').catch(() => ''), { timeout: 10_000 }).toBe(`relancée --user-data-dir=${preparation.profil}\n`);
});
