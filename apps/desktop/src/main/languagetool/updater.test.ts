import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zipSync } from 'fflate';
import { c as creerTar } from 'tar';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LanguageToolUpdater, derniereVersionDeLanguageTool, lireDerniereJava } from './updater';
import type { ServerState } from './server';
import { ecrireVersions, lireVersions } from './versions';

let racine: string;
let dossier: string;
beforeEach(async () => {
  racine = await mkdtemp(join(tmpdir(), 'notes-maj-'));
  dossier = join(racine, 'LanguageTool');
  for (const partie of ['java', 'languagetool', 'ngrammes']) {
    await mkdir(join(dossier, partie), { recursive: true });
    await writeFile(join(dossier, partie, 'ancien'), partie);
  }
  await ecrireVersions(dossier, { java: 'jdk-17.0.20.1+1', languagetool: '6.6', ngrammes: '20150913' });
});
afterEach(async () => {
  await rm(racine, { recursive: true, force: true });
});

const empreinte = (octets: Uint8Array): string => createHash('sha256').update(octets).digest('hex');

async function javaTarGz(): Promise<Uint8Array> {
  const source = join(racine, 'source');
  await mkdir(join(source, 'jdk-21-jre', 'bin'), { recursive: true });
  await writeFile(join(source, 'jdk-21-jre', 'bin', 'java'), 'nouveau java');
  await creerTar({ gzip: true, file: join(racine, 'java.tar.gz'), cwd: source }, ['jdk-21-jre']);
  return new Uint8Array(await readFile(join(racine, 'java.tar.gz')));
}

const zipLanguageTool = (): Uint8Array => zipSync({ 'LanguageTool-6.7/languagetool-server.jar': new TextEncoder().encode('nouveau jar') });

const javaPubliee = (octets: Uint8Array, nom = 'jdk-21.0.9+10') => [
  { release_name: nom, binary: { package: { link: 'https://github.com/adoptium/temurin21-binaries/jre.tar.gz', size: octets.length, checksum: empreinte(octets) } } },
];

function sources(fichiers: Record<string, string | Uint8Array>) {
  return (adresse: string): Promise<Response> => {
    const contenu = Object.entries(fichiers).find(([debut]) => adresse.startsWith(debut))?.[1];
    return Promise.resolve(contenu === undefined ? new Response('', { status: 404 }) : new Response(contenu));
  };
}

function fauxServeur(redemarre = true) {
  const journal: string[] = [];
  let etat: ServerState = 'pret';
  return {
    journal,
    serveur: {
      arreter: async () => {
        journal.push('arrêt');
        etat = 'arrete';
      },
      demarrer: async () => {
        journal.push('démarrage');
        etat = redemarre ? 'pret' : 'erreur';
      },
      lireEtat: () => etat,
    },
  };
}

describe('versions publiées', () => {
  it('trouve la dernière version de LanguageTool dans la page de téléchargement', () => {
    expect(derniereVersionDeLanguageTool('<a href="LanguageTool-6.9.zip">… LanguageTool-6.10.zip LanguageTool-6.6.zip LanguageTool-stable.zip')).toBe('6.10');
    expect(derniereVersionDeLanguageTool('rien')).toBeNull();
  });

  it('lit la dernière version de Java chez Adoptium, et refuse une réponse douteuse', () => {
    const bonne = javaPubliee(new Uint8Array([1, 2, 3]));
    expect(lireDerniereJava(bonne)?.nom).toBe('jdk-21.0.9+10');
    expect(lireDerniereJava([{ ...bonne[0], binary: { package: { ...bonne[0]!.binary.package, link: 'http://ailleurs.test/jre.tar.gz' } } }])).toBeNull();
    expect(lireDerniereJava([{ ...bonne[0], binary: { package: { ...bonne[0]!.binary.package, checksum: 'abc' } } }])).toBeNull();
    expect(lireDerniereJava({})).toBeNull();
  });
});

describe('mise à jour automatique', () => {
  it('installe la nouvelle version après un essai réussi, et relance le serveur', async () => {
    const java = await javaTarGz();
    const { journal, serveur } = fauxServeur();
    const essais: string[] = [];
    const maj = new LanguageToolUpdater({
      dossier,
      serveur,
      surEtat: () => undefined,
      telecharger: sources({
        'https://languagetool.org/download/LanguageTool-6.7.zip': zipLanguageTool(),
        'https://languagetool.org/download/': 'LanguageTool-6.6.zip LanguageTool-6.7.zip',
        'https://api.adoptium.net/v3/info/available_releases': JSON.stringify({ most_recent_lts: 21 }),
        'https://api.adoptium.net/v3/assets/latest/21/': JSON.stringify(javaPubliee(java)),
        'https://github.com/adoptium/': java,
      }),
      essayer: async (candidat) => {
        essais.push(await readFile(join(candidat.java, 'bin', 'java'), 'utf8'));
        return null;
      },
    });
    await maj.verifier();
    expect(maj.etat().message).toBe('Mis à jour : LanguageTool 6.7, Java 21.0.9.');
    expect(essais).toEqual(['nouveau java']);
    expect(journal).toEqual(['arrêt', 'démarrage']);
    expect(await readFile(join(dossier, 'java', 'bin', 'java'), 'utf8')).toBe('nouveau java');
    expect(await readFile(join(dossier, 'languagetool', 'languagetool-server.jar'), 'utf8')).toBe('nouveau jar');
    expect(await readFile(join(dossier, 'ngrammes', 'ancien'), 'utf8')).toBe('ngrammes');
    expect(await lireVersions(dossier)).toEqual({ java: 'jdk-21.0.9+10', languagetool: '6.7', ngrammes: '20150913' });
    expect((await readdir(racine)).sort()).toEqual(['LanguageTool', 'java.tar.gz', 'source']);

    // Le lendemain seulement : une seconde recherche le même jour ne fait rien.
    await maj.verifier();
    expect(journal).toEqual(['arrêt', 'démarrage']);
  });

  it("garde l'installation si l'essai échoue", async () => {
    const { journal, serveur } = fauxServeur();
    const maj = new LanguageToolUpdater({
      dossier,
      serveur,
      surEtat: () => undefined,
      telecharger: sources({
        'https://languagetool.org/download/LanguageTool-6.7.zip': zipLanguageTool(),
        'https://languagetool.org/download/': 'LanguageTool-6.7.zip',
        'https://api.adoptium.net/v3/info/available_releases': JSON.stringify({ most_recent_lts: 17 }),
        'https://api.adoptium.net/v3/assets/latest/17/': JSON.stringify(javaPubliee(new Uint8Array([1]), 'jdk-17.0.20.1+1')),
      }),
      essayer: () => Promise.resolve('la nouvelle version ne démarre pas'),
    });
    await maj.verifier();
    expect(maj.etat().message).toBe("LanguageTool 6.7, Java 17.0.20.1 essayé et refusé (la nouvelle version ne démarre pas) : l'installation actuelle est gardée.");
    expect(journal).toEqual([]);
    expect(await readFile(join(dossier, 'languagetool', 'ancien'), 'utf8')).toBe('languagetool');
    expect(await readdir(racine)).toEqual(['LanguageTool']);
  });

  it("remet l'ancienne version si le serveur ne redémarre pas", async () => {
    const { journal, serveur } = fauxServeur(false);
    const maj = new LanguageToolUpdater({
      dossier,
      serveur,
      surEtat: () => undefined,
      telecharger: sources({
        'https://languagetool.org/download/LanguageTool-6.7.zip': zipLanguageTool(),
        'https://languagetool.org/download/': 'LanguageTool-6.7.zip',
        'https://api.adoptium.net/v3/info/available_releases': JSON.stringify({ most_recent_lts: 17 }),
        'https://api.adoptium.net/v3/assets/latest/17/': JSON.stringify(javaPubliee(new Uint8Array([1]), 'jdk-17.0.20.1+1')),
      }),
      essayer: () => Promise.resolve(null),
    });
    await maj.verifier();
    expect(maj.etat().message).toBe("LanguageTool 6.7, Java 17.0.20.1 installé mais le serveur n'a pas redémarré : l'ancienne version est revenue.");
    expect(journal).toEqual(['arrêt', 'démarrage', 'arrêt', 'démarrage']);
    expect(await readFile(join(dossier, 'languagetool', 'ancien'), 'utf8')).toBe('languagetool');
    expect((await lireVersions(dossier))?.languagetool).toBe('6.6');
  });

  it("refuse un Java dont l'empreinte ne correspond pas, et dit qu'il est à jour sinon", async () => {
    const java = await javaTarGz();
    const { serveur } = fauxServeur();
    const publiee = javaPubliee(java);
    publiee[0]!.binary.package.checksum = '0'.repeat(64);
    const maj = new LanguageToolUpdater({
      dossier,
      serveur,
      surEtat: () => undefined,
      telecharger: sources({
        'https://languagetool.org/download/': 'LanguageTool-6.6.zip',
        'https://api.adoptium.net/v3/info/available_releases': JSON.stringify({ most_recent_lts: 21 }),
        'https://api.adoptium.net/v3/assets/latest/21/': JSON.stringify(publiee),
        'https://github.com/adoptium/': java,
      }),
      essayer: () => Promise.resolve(null),
      maintenant: () => 0,
    });
    await maj.verifier();
    expect(maj.etat().message).toMatch(/empreinte différente/);
    expect((await lireVersions(dossier))?.java).toBe('jdk-17.0.20.1+1');

    const aJour = new LanguageToolUpdater({
      dossier,
      serveur,
      surEtat: () => undefined,
      telecharger: sources({
        'https://languagetool.org/download/': 'LanguageTool-6.6.zip',
        'https://api.adoptium.net/v3/info/available_releases': JSON.stringify({ most_recent_lts: 17 }),
        'https://api.adoptium.net/v3/assets/latest/17/': JSON.stringify(javaPubliee(new Uint8Array([1]), 'jdk-17.0.20.1+1')),
      }),
    });
    await aJour.verifier(true);
    expect(aJour.etat().message).toBe('À jour.');
  });
});
