import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Versions installées dans le dossier de LanguageTool. Écrit à la fin d'une installation ou d'une mise à jour. */
export interface InstalledVersions {
  /** Nom de la version de Java chez Adoptium (`jdk-17.0.20.1+1`). */
  java: string;
  /** Version de LanguageTool (`6.6`). */
  languagetool: string;
  /** Date des n-grammes : une seule version existe. */
  ngrammes: string;
}

export const nomDuFichierDesVersions = 'versions.json';

/** Ce que pose l'installation (`downloads.ts`), avant toute mise à jour. */
export const versionsInitiales: InstalledVersions = { java: 'jdk-17.0.20.1+1', languagetool: '6.6', ngrammes: '20150913' };

/** Ce qu'écrivait la 0.11.x dans `version.txt`, à reconnaître pour ne pas tout réinstaller. */
const ancienneVersion = 'languagetool-6.6+temurin-17.0.20.1+ngrams-fr-20150913';

/** Les versions installées, null si l'installation n'est pas finie (aucun fichier, ou illisible). */
export async function lireVersions(dossier: string): Promise<InstalledVersions | null> {
  try {
    const lu = JSON.parse(await readFile(join(dossier, nomDuFichierDesVersions), 'utf8')) as Partial<Record<keyof InstalledVersions, unknown>>;
    return typeof lu.java === 'string' && typeof lu.languagetool === 'string' && typeof lu.ngrammes === 'string'
      ? { java: lu.java, languagetool: lu.languagetool, ngrammes: lu.ngrammes }
      : null;
  } catch {
    const ancien = await readFile(join(dossier, 'version.txt'), 'utf8').catch(() => '');
    return ancien.trim() === ancienneVersion ? versionsInitiales : null;
  }
}

export async function ecrireVersions(dossier: string, versions: InstalledVersions): Promise<void> {
  await writeFile(join(dossier, nomDuFichierDesVersions), `${JSON.stringify(versions, null, 2)}\n`);
}

/** Compare deux versions numériques (`6.10` après `6.9`). */
export function comparerVersions(a: string, b: string): number {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const difference = (x[i] ?? 0) - (y[i] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}

/** Version lisible de Java : `jdk-17.0.20.1+1` donne `17.0.20.1`. */
export function versionLisibleDeJava(nom: string): string {
  return nom.replace(/^jdk-?/, '').replace(/\+.*$/, '');
}
