import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { x as extraireTar } from 'tar';
import yauzl from 'yauzl';
import type { Entry, ZipFile } from 'yauzl';

/**
 * Décompression des archives de LanguageTool (docs/spec/correction.md), en JavaScript pur :
 * rien n'est demandé au système (`unzip`, `tar`). Un chemin qui sortirait du
 * dossier de destination est refusé. La progression compte les octets de
 * l'archive déjà lus.
 */
export interface Extraction {
  fichier: string;
  destination: string;
  /** Niveaux de dossiers retirés en tête de chaque chemin. */
  niveauxRetires: number;
  surProgression: (octetsLus: number) => void;
  signal: AbortSignal;
}

/** Chemin d'une entrée dans la destination, ou null si elle est à sauter (dossier de tête retiré, chemin refusé). */
export function cheminDeDestination(destination: string, nom: string, niveauxRetires: number): string | null {
  const morceaux = nom.split('/').filter((morceau) => morceau !== '' && morceau !== '.');
  if (morceaux.some((morceau) => morceau === '..') || isAbsolute(nom) || nom.includes('\\')) {
    throw new Error(`Chemin refusé dans l'archive : ${nom}`);
  }
  const restants = morceaux.slice(niveauxRetires);
  if (restants.length === 0) {
    return null;
  }
  const chemin = join(destination, ...restants);
  const relatif = relative(destination, chemin);
  if (relatif.startsWith('..') || isAbsolute(relatif)) {
    throw new Error(`Chemin refusé dans l'archive : ${nom}`);
  }
  return chemin;
}

/** Compte les octets qui passent. */
function compteur(surOctets: (total: number) => void): Transform {
  let total = 0;
  return new Transform({
    transform(morceau: Buffer, _encodage, suite) {
      total += morceau.length;
      surOctets(total);
      suite(null, morceau);
    },
  });
}

export async function extraireTarGz({ fichier, destination, niveauxRetires, surProgression, signal }: Extraction): Promise<void> {
  await mkdir(destination, { recursive: true });
  // tar refuse de lui-même les chemins absolus et les « .. » (preservePaths faux), et ne suit pas les liens hors du dossier.
  await pipeline(createReadStream(fichier), compteur(surProgression), extraireTar({ cwd: destination, strip: niveauxRetires }), { signal });
}

function ouvrirZip(fichier: string): Promise<ZipFile> {
  return new Promise((resoudre, rejeter) => {
    yauzl.open(fichier, { lazyEntries: true, autoClose: true, validateEntrySizes: true }, (erreur, zip) => (erreur === null ? resoudre(zip) : rejeter(erreur)));
  });
}

function lireEntree(zip: ZipFile, entree: Entry): Promise<NodeJS.ReadableStream> {
  return new Promise((resoudre, rejeter) => {
    zip.openReadStream(entree, (erreur, flux) => (erreur === null ? resoudre(flux) : rejeter(erreur)));
  });
}

export async function extraireZip({ fichier, destination, niveauxRetires, surProgression, signal }: Extraction): Promise<void> {
  await mkdir(destination, { recursive: true });
  const zip = await ouvrirZip(fichier);
  await new Promise<void>((resoudre, rejeter) => {
    const echouer = (erreur: unknown): void => {
      zip.close();
      rejeter(erreur instanceof Error ? erreur : new Error(String(erreur)));
    };
    const surEntree = async (entree: Entry): Promise<void> => {
      signal.throwIfAborted();
      const chemin = cheminDeDestination(destination, entree.fileName, niveauxRetires);
      if (chemin !== null) {
        if (entree.fileName.endsWith('/')) {
          await mkdir(chemin, { recursive: true });
        } else {
          await mkdir(dirname(chemin), { recursive: true });
          // Un fichier de l'archive peut peser plus d'un gigaoctet (n-grammes) : la progression avance pendant qu'on l'écrit.
          const debut = entree.relativeOffsetOfLocalHeader;
          const rapport = entree.uncompressedSize === 0 ? 0 : entree.compressedSize / entree.uncompressedSize;
          const suivi = compteur((ecrits) => surProgression(debut + Math.min(entree.compressedSize, Math.floor(ecrits * rapport))));
          await pipeline(await lireEntree(zip, entree), suivi, createWriteStream(chemin), { signal });
        }
      }
      surProgression(entree.relativeOffsetOfLocalHeader + entree.compressedSize);
      zip.readEntry();
    };
    zip.on('entry', (entree: Entry) => void surEntree(entree).catch(echouer));
    zip.on('end', () => resoudre());
    zip.on('error', echouer);
    zip.readEntry();
  });
}
