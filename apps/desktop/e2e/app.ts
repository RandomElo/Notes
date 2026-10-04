import { cp, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from '@playwright/test';
import type { ElectronApplication, Locator, Page } from '@playwright/test';

const dossierApplication = join(dirname(fileURLToPath(import.meta.url)), '..');
const vaultDExemple = join(dossierApplication, '../../fixtures/vault-demo');

export interface Session {
  application: ElectronApplication;
  page: Page;
  /** Dossier des notes : une copie du vault d'exemple. */
  vault: string;
  profil: string;
}

/** Copie le vault d'exemple dans un dossier temporaire et prépare un profil qui l'ouvre. */
export async function preparer(): Promise<{ vault: string; profil: string }> {
  const base = await mkdtemp(join(tmpdir(), 'notes-e2e-'));
  const vault = join(base, 'vault');
  const profil = join(base, 'profil');
  await cp(vaultDExemple, vault, { recursive: true });
  await mkdir(profil, { recursive: true });
  await writeFile(join(profil, 'settings.json'), JSON.stringify({ nas: null, vaultLocal: vault }));
  return { vault, profil };
}

/** Lance l'application construite sur un vault et un profil donnés. */
export async function lancer({ vault, profil }: { vault: string; profil: string }, argumentsEnPlus: string[] = []): Promise<Session> {
  const application = await electron.launch({ args: [dossierApplication, `--user-data-dir=${profil}`, ...argumentsEnPlus], cwd: dossierApplication });
  // La petite fenêtre de la recherche globale, créée cachée au lancement, n'est pas celle qu'on pilote.
  // Une fenêtre tout juste créée n'a pas encore d'adresse : on attend de pouvoir les distinguer.
  const estPrincipale = (fenetre: Page): boolean => fenetre.url().startsWith('file:') && !fenetre.url().endsWith('#recherche');
  let page: Page | undefined;
  while ((page = application.windows().find(estPrincipale)) === undefined) {
    await new Promise((resoudre) => setTimeout(resoudre, 20));
  }
  await page.getByRole('tree').waitFor();
  return { application, page, vault, profil };
}

/** Ligne de commande qui lance l'application construite sur ce profil, comme le raccourci du bureau avec `--recherche`. */
export function argumentsDeLancement(profil: string, argumentsEnPlus: string[] = []): string[] {
  return [dossierApplication, `--user-data-dir=${profil}`, ...argumentsEnPlus];
}

export { dossierApplication };

/** Fenêtres ouvertes, vues du main : titre et visibilité. */
export async function fenetres(application: ElectronApplication): Promise<{ titre: string; visible: boolean }[]> {
  return application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((fenetre) => ({ titre: fenetre.getTitle(), visible: fenetre.isVisible() })));
}

/** Ferme la fenêtre par son bouton, comme l'utilisateur, et attend la fin du processus. */
export async function fermer({ application, page }: Session): Promise<void> {
  const fermee = page.waitForEvent('close');
  await page.getByRole('button', { name: 'Fermer', exact: true }).click();
  await fermee;
  // La fenêtre fermée, Notes reste en fond pour la recherche globale : on la quitte comme par « Quitter ».
  const fin = application.waitForEvent('close');
  await application.evaluate(({ app }) => app.quit());
  await fin;
}

/** Ligne de l'arborescence qui porte ce titre. */
export function ligne(page: Page, titre: string): Locator {
  return page.locator(`[role="treeitem"]:has(span[title="${titre}"])`);
}

export async function ouvrirPage(page: Page, titre: string): Promise<void> {
  await ligne(page, titre).click();
  await titreDePage(page).filter({ hasText: new RegExp(`^${titre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }).waitFor();
  await editeur(page).waitFor();
}

/** Titre de la page ouverte, modifiable sur place. */
export function titreDePage(page: Page): Locator {
  return page.getByRole('textbox', { name: 'Titre de la page' });
}

/** Zone de saisie de la page ouverte. */
export function editeur(page: Page): Locator {
  return page.locator('.notes-page[contenteditable="true"]');
}

export async function attendreEnregistrement(page: Page): Promise<void> {
  await page.getByRole('status').filter({ hasText: /^Enregistré$/ }).waitFor();
}

/** Tous les fichiers du vault, « chemin relatif → contenu ». */
export async function lireVault(vault: string): Promise<Record<string, string>> {
  const fichiers: Record<string, string> = {};
  const parcourir = async (dossier: string): Promise<void> => {
    for (const entree of await readdir(dossier, { withFileTypes: true })) {
      const chemin = join(dossier, entree.name);
      if (entree.isDirectory()) {
        await parcourir(chemin);
      } else {
        fichiers[relative(vault, chemin)] = await readFile(chemin, 'utf8');
      }
    }
  };
  await parcourir(vault);
  return fichiers;
}

/** Corps d'une page du vault, sans son front-matter. */
export async function lireCorps(vault: string, page: string): Promise<string> {
  return (await readFile(join(vault, page, 'page.md'), 'utf8')).replace(/^---\n[\s\S]*?\n---\n/, '');
}
