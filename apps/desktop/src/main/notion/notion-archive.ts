import { createReadStream, createWriteStream, mkdirSync } from 'node:fs';
import { mkdir, open, readdir, rm } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { Unzip, UnzipInflate } from 'fflate';

/**
 * Extraction des archives d'un export Notion (docs/spec/import-notion.md) dans
 * un dossier temporaire. Notion découpe un gros export en plusieurs `.zip`, et
 * met parfois les morceaux dans un `.zip` : ceux-là sont ouverts à leur tour.
 * Lu et écrit au fil de l'eau, sans charger une archive entière en mémoire.
 * Un nom qui sortirait du dossier (`../`, chemin absolu) est ignoré.
 */

/** Au plus ce niveau d'archives dans des archives. */
const profondeurMax = 3;

/** Chemin sûr d'une entrée sous « dossier », ou null si elle en sortirait. */
export function cheminDEntree(dossier: string, nom: string): string | null {
  const propre = nom.replace(/\\/g, '/');
  if (propre === '' || propre.startsWith('/') || /^[a-z]:/i.test(propre) || propre.split('/').includes('..')) {
    return null;
  }
  const cible = resolve(dossier, propre);
  const depuis = relative(dossier, cible);
  return depuis === '' || depuis.startsWith('..') || isAbsolute(depuis) ? null : cible;
}

/** Un `.zip` commence par « PK » suivi de 3 et 4 (ou 5 et 6 s'il est vide). */
async function verifierArchive(archive: string): Promise<void> {
  const fichier = await open(archive, 'r');
  try {
    const { bytesRead, buffer } = await fichier.read(Buffer.alloc(4), 0, 4, 0);
    const signature = bytesRead === 4 ? buffer.toString('latin1') : '';
    if (signature !== 'PK\u0003\u0004' && signature !== 'PK\u0005\u0006') {
      throw new Error(`${basename(archive)} n'est pas une archive .zip.`);
    }
  } finally {
    await fichier.close();
  }
}

async function extraireUne(archive: string, dossier: string): Promise<void> {
  await verifierArchive(archive);
  return new Promise((resoudre, rejeter) => {
    let enCours = 0;
    let lectureFinie = false;
    let echec: Error | null = null;
    let fini = false;
    const conclure = (): void => {
      if (fini) {
        return;
      }
      if (echec !== null) {
        fini = true;
        rejeter(echec);
      } else if (lectureFinie && enCours === 0) {
        fini = true;
        resoudre();
      }
    };
    const noterEchec = (erreur: unknown): void => {
      echec ??= erreur instanceof Error ? erreur : new Error(String(erreur));
      conclure();
    };
    const unzip = new Unzip((fichier) => {
      const cible = cheminDEntree(dossier, fichier.name);
      if (cible === null || fichier.name.endsWith('/')) {
        return;
      }
      // Dossier et fichier créés tout de suite : les données arrivent dès « start ».
      mkdirSync(dirname(cible), { recursive: true });
      const sortie = createWriteStream(cible);
      enCours += 1;
      sortie.on('close', () => {
        enCours -= 1;
        conclure();
      });
      sortie.on('error', noterEchec);
      fichier.ondata = (erreur, morceau, dernier) => {
        if (erreur !== null) {
          noterEchec(erreur);
          sortie.destroy();
          return;
        }
        sortie.write(morceau);
        if (dernier) {
          sortie.end();
        }
      };
      fichier.start();
    });
    unzip.register(UnzipInflate);
    const lecture = createReadStream(archive);
    lecture.on('data', (morceau) => {
      try {
        unzip.push(morceau as Uint8Array);
      } catch (erreur) {
        lecture.destroy();
        noterEchec(erreur);
      }
    });
    lecture.on('error', noterEchec);
    lecture.on('end', () => {
      try {
        unzip.push(new Uint8Array(0), true);
      } catch (erreur) {
        noterEchec(erreur);
        return;
      }
      lectureFinie = true;
      conclure();
    });
  });
}

async function archivesDans(dossier: string): Promise<string[]> {
  const entrees = await readdir(dossier, { recursive: true, withFileTypes: true });
  return entrees.filter((entree) => entree.isFile() && /\.zip$/i.test(entree.name)).map((entree) => join(entree.parentPath, entree.name));
}

/** Extrait les archives dans « dossier », puis celles qu'elles contenaient. */
export async function extraireArchives(archives: readonly string[], dossier: string): Promise<void> {
  await mkdir(dossier, { recursive: true });
  for (const archive of archives) {
    await extraireUne(archive, dossier);
  }
  for (let profondeur = 0; profondeur < profondeurMax; profondeur++) {
    const internes = await archivesDans(dossier);
    if (internes.length === 0) {
      return;
    }
    for (const interne of internes) {
      await extraireUne(interne, dirname(interne));
      await rm(interne, { force: true });
    }
  }
}
