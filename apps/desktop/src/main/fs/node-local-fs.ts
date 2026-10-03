import { randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { LocalFsError, dossierParent, nomDeBase, verifierCheminRelatif } from '@notes/core';
import type { LocalEntry, LocalFs } from '@notes/core';

/**
 * LocalFs du desktop : le vault est un dossier du disque. Tout chemin est
 * validé avant d'être résolu, donc rien ne peut sortir de la racine. Les
 * liens symboliques ne sont jamais suivis.
 */
export class NodeLocalFs implements LocalFs {
  constructor(private readonly racine: string) {}

  async infos(chemin: string): Promise<LocalEntry | null> {
    try {
      const stats = await lstat(this.resoudre(chemin, true));
      if (stats.isSymbolicLink() || (!stats.isDirectory() && !stats.isFile())) {
        return null;
      }
      return {
        nom: nomDeBase(chemin),
        estDossier: stats.isDirectory(),
        taille: stats.isDirectory() ? 0 : stats.size,
        modifieLe: Math.round(stats.mtimeMs),
      };
    } catch (erreur) {
      if (codeDe(erreur) === 'ENOENT' || codeDe(erreur) === 'ENOTDIR') {
        return null;
      }
      throw traduire(erreur, chemin);
    }
  }

  async lister(chemin: string): Promise<LocalEntry[]> {
    const dossier = this.resoudre(chemin, true);
    try {
      const entrees: LocalEntry[] = [];
      for (const entree of await readdir(dossier, { withFileTypes: true })) {
        if (entree.isDirectory()) {
          entrees.push({ nom: entree.name, estDossier: true, taille: 0, modifieLe: 0 });
        } else if (entree.isFile()) {
          const stats = await lstat(join(dossier, entree.name));
          entrees.push({ nom: entree.name, estDossier: false, taille: stats.size, modifieLe: Math.round(stats.mtimeMs) });
        }
      }
      return entrees;
    } catch (erreur) {
      throw traduire(erreur, chemin);
    }
  }

  async lireTexte(chemin: string): Promise<string> {
    try {
      return await readFile(this.resoudre(chemin), 'utf8');
    } catch (erreur) {
      throw traduire(erreur, chemin);
    }
  }

  async ecrireTexte(chemin: string, contenu: string): Promise<void> {
    await this.ecrireOctets(chemin, Buffer.from(contenu, 'utf8'));
  }

  async lireOctets(chemin: string): Promise<Uint8Array> {
    try {
      return new Uint8Array(await readFile(this.resoudre(chemin)));
    } catch (erreur) {
      throw traduire(erreur, chemin);
    }
  }

  async ecrireOctets(chemin: string, contenu: Uint8Array): Promise<void> {
    const cible = this.resoudre(chemin);
    // Écriture atomique : un fichier temporaire à côté, puis un renommage. Une
    // coupure en cours d'écriture laisse l'ancien contenu intact.
    const temporaire = join(this.resoudre(dossierParent(chemin), true), `.${nomDeBase(chemin)}.${randomBytes(6).toString('hex')}.tmp`);
    try {
      await writeFile(temporaire, contenu, { flag: 'wx' });
      await rename(temporaire, cible);
    } catch (erreur) {
      await rm(temporaire, { force: true }).catch(() => undefined);
      throw traduire(erreur, chemin);
    }
  }

  async creerDossier(chemin: string): Promise<void> {
    try {
      await mkdir(this.resoudre(chemin), { recursive: true });
    } catch (erreur) {
      throw traduire(erreur, chemin);
    }
  }

  async renommer(chemin: string, vers: string): Promise<void> {
    const source = this.resoudre(chemin);
    const destination = this.resoudre(vers);
    if ((await this.existe(destination)) && !(await memeFichier(source, destination))) {
      throw new LocalFsError('existe_deja', `La destination existe déjà : ${vers}`);
    }
    try {
      await rename(source, destination);
    } catch (erreur) {
      throw traduire(erreur, chemin);
    }
  }

  async copierFichier(chemin: string, vers: string): Promise<void> {
    try {
      await copyFile(this.resoudre(chemin), this.resoudre(vers), constants.COPYFILE_EXCL);
    } catch (erreur) {
      throw traduire(erreur, chemin);
    }
  }

  async supprimer(chemin: string): Promise<void> {
    try {
      await rm(this.resoudre(chemin), { recursive: true });
    } catch (erreur) {
      throw traduire(erreur, chemin);
    }
  }

  private resoudre(chemin: string, racinePermise = false): string {
    if (chemin === '' && racinePermise) {
      return this.racine;
    }
    const refus = verifierCheminRelatif(chemin);
    if (refus !== null) {
      throw new LocalFsError('chemin_invalide', refus);
    }
    return join(this.racine, ...chemin.split('/'));
  }

  private async existe(cheminAbsolu: string): Promise<boolean> {
    try {
      await lstat(cheminAbsolu);
      return true;
    } catch {
      return false;
    }
  }
}

/** Vrai si les deux chemins désignent le même fichier (renommage qui ne change que la casse). */
async function memeFichier(a: string, b: string): Promise<boolean> {
  try {
    const [statsA, statsB] = await Promise.all([lstat(a), lstat(b)]);
    return statsA.ino === statsB.ino && statsA.dev === statsB.dev;
  } catch {
    return false;
  }
}

function codeDe(erreur: unknown): string {
  return typeof erreur === 'object' && erreur !== null && 'code' in erreur ? String(erreur.code) : '';
}

function traduire(erreur: unknown, chemin: string): LocalFsError {
  if (erreur instanceof LocalFsError) {
    return erreur;
  }
  switch (codeDe(erreur)) {
    case 'ENOENT':
    case 'ENOTDIR':
      return new LocalFsError('introuvable', `Introuvable : ${chemin}`);
    case 'EEXIST':
    case 'ENOTEMPTY':
      return new LocalFsError('existe_deja', `Existe déjà : ${chemin}`);
    default:
      return new LocalFsError('interne', `Erreur d'accès au disque pour ${chemin}`);
  }
}
