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
export async function lancer({ vault, profil }: { vault: string; profil: string }): Promise<Session> {
  const application = await electron.launch({ args: [dossierApplication, `--user-data-dir=${profil}`], cwd: dossierApplication });
  const page = await application.firstWindow();
  await page.getByRole('tree').waitFor();
  return { application, page, vault, profil };
}

/** Ferme la fenêtre par son bouton, comme l'utilisateur, et attend la fin du processus. */
export async function fermer({ application, page }: Session): Promise<void> {
  const fin = application.waitForEvent('close');
  await page.getByRole('button', { name: 'Fermer', exact: true }).click();
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
