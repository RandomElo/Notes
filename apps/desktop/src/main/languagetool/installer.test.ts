import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zipSync } from 'fflate';
import { c as creerTar } from 'tar';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cheminDeDestination } from './archive';
import { versionInstallee } from './downloads';
import type { ArchiveATelecharger } from './downloads';
import { LanguageToolInstaller, estInstalle } from './installer';

let dossierDEssai: string;
beforeEach(async () => {
  dossierDEssai = await mkdtemp(join(tmpdir(), 'notes-languagetool-'));
});
afterEach(async () => {
  await rm(dossierDEssai, { recursive: true, force: true });
});

const empreinte = (octets: Uint8Array): string => createHash('sha256').update(octets).digest('hex');

async function tarGz(): Promise<Uint8Array> {
  const source = join(dossierDEssai, 'source');
  await mkdir(join(source, 'jdk-17-jre', 'bin'), { recursive: true });
  await writeFile(join(source, 'jdk-17-jre', 'bin', 'java'), '#!/bin/sh\n', { mode: 0o755 });
  const fichier = join(dossierDEssai, 'java.tar.gz');
  await creerTar({ gzip: true, file: fichier, cwd: source }, ['jdk-17-jre']);
  return new Uint8Array(await readFile(fichier));
}

function zip(): Uint8Array {
  return zipSync({ 'LanguageTool-6.6/': {}, 'LanguageTool-6.6/languagetool-server.jar': new TextEncoder().encode('jar') });
}

function archive(dossier: ArchiveATelecharger['dossier'], octets: Uint8Array, format: ArchiveATelecharger['format']): ArchiveATelecharger {
  return { dossier, libelle: dossier, adresse: `https://exemple.test/${dossier}`, taille: octets.length, empreinte: empreinte(octets), format, niveauxRetires: 1 };
}

describe('installation de LanguageTool', () => {
  it("refuse un fichier dont l'empreinte ne correspond pas, sans rien laisser", async () => {
    const languagetool = zip();
    const dossier = join(dossierDEssai, 'LanguageTool');
    const installateur = new LanguageToolInstaller({
      dossier,
      archives: [{ ...archive('languagetool', languagetool, 'zip'), empreinte: '0'.repeat(64) }],
      telecharger: () => Promise.resolve(new Response(languagetool)),
      surEtapes: () => undefined,
      placeNecessaire: 0,
    });
    expect(await installateur.installer()).toMatch(/empreinte différente/);
    expect(await readdir(dossierDEssai)).toEqual([]);
    expect(await estInstalle(dossier)).toBe(false);
  });

  it('installe pour de bon quand la place suffit', async () => {
    const java = await tarGz();
    const languagetool = zip();
    const fichiers = new Map([
      ['https://exemple.test/java', java],
      ['https://exemple.test/languagetool', languagetool],
    ]);
    const dossier = join(dossierDEssai, 'Applications', 'LanguageTool');
    const etats: string[] = [];
    const installateur = new LanguageToolInstaller({
      dossier,
      archives: [archive('java', java, 'tar.gz'), archive('languagetool', languagetool, 'zip')],
      telecharger: (adresse) => Promise.resolve(new Response(fichiers.get(adresse) ?? null)),
      surEtapes: (etapes) => etats.push(etapes.map((etape) => `${etape.id}:${etape.etat}`).join(',')),
      placeNecessaire: 0,
    });
    expect(await installateur.installer()).toBeNull();
    expect(await readFile(join(dossier, 'java', 'bin', 'java'), 'utf8')).toBe('#!/bin/sh\n');
    expect(await readFile(join(dossier, 'languagetool', 'languagetool-server.jar'), 'utf8')).toBe('jar');
    expect(await readFile(join(dossier, 'version.txt'), 'utf8')).toBe(`${versionInstallee}\n`);
    expect(await estInstalle(dossier)).toBe(true);
    // Les archives ne restent pas, ni le dossier de préparation.
    expect((await readdir(dossier)).sort()).toEqual(['java', 'languagetool', 'version.txt']);
    expect(await readdir(join(dossierDEssai, 'Applications'))).toEqual(['LanguageTool']);
    expect(etats.at(-1)).toBe('java:fait,languagetool:fait');
  });

  it("s'arrête si le serveur envoie plus que prévu", async () => {
    const languagetool = zip();
    const installateur = new LanguageToolInstaller({
      dossier: join(dossierDEssai, 'LanguageTool'),
      archives: [{ ...archive('languagetool', languagetool, 'zip'), taille: 10 }],
      telecharger: () => Promise.resolve(new Response(languagetool)),
      surEtapes: () => undefined,
      placeNecessaire: 0,
    });
    expect(await installateur.installer()).toMatch(/plus gros que prévu/);
    expect(await readdir(dossierDEssai)).toEqual([]);
  });

  it('refuse un chemin qui sort du dossier', () => {
    expect(cheminDeDestination('/d', 'LanguageTool-6.6/libs/a.jar', 1)).toBe('/d/libs/a.jar');
    expect(cheminDeDestination('/d', 'LanguageTool-6.6/', 1)).toBeNull();
    expect(() => cheminDeDestination('/d', 'a/../../etc/passwd', 0)).toThrow();
    expect(() => cheminDeDestination('/d', '/etc/passwd', 0)).toThrow();
  });
});
