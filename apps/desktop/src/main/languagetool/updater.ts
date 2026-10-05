import { spawn } from 'node:child_process';
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';
import type { SpellcheckUpdate } from '../../shared/ipc-contract';
import { extraireTarGz, extraireZip } from './archive';
import { verifierTexte } from './client';
import { telechargerVers } from './download';
import type { Telecharger } from './download';
import { reglagesDuServeur } from './launcher';
import { estLanguageTool } from './server';
import type { ServerState } from './server';
import { comparerVersions, ecrireVersions, lireVersions, versionLisibleDeJava } from './versions';
import type { InstalledVersions } from './versions';

/** On ne cherche pas plus d'une fois par jour, sauf demande depuis les réglages. */
export const intervalleDeVerificationMs = 24 * 3600 * 1000;
/** LanguageTool ne publie pas d'empreinte : on borne au moins ce qu'on accepte de télécharger. */
const tailleMaxDeLanguageTool = 800_000_000;
const delaiDEssaiMs = 120_000;

const listeDesVersions = 'https://languagetool.org/download/';
const versionsDeJava = 'https://api.adoptium.net/v3/info/available_releases';
const derniereJava = (lts: number): string => `https://api.adoptium.net/v3/assets/latest/${lts}/hotspot?architecture=x64&image_type=jre&os=linux&vendor=eclipse`;

/** La dernière version de LanguageTool dans la page de téléchargement (`LanguageTool-6.6.zip`), null si aucune. */
export function derniereVersionDeLanguageTool(page: string): string | null {
  const versions = [...page.matchAll(/LanguageTool-(\d+\.\d+(?:\.\d+)?)\.zip/g)].map((trouve) => trouve[1] as string);
  return versions.sort(comparerVersions).at(-1) ?? null;
}

export interface JavaRelease {
  nom: string;
  adresse: string;
  taille: number;
  empreinte: string;
}

/** La dernière version de Java d'après l'API d'Adoptium, revérifiée : téléchargement https chez GitHub, empreinte SHA-256. */
export function lireDerniereJava(json: unknown): JavaRelease | null {
  const premier = Array.isArray(json) ? (json[0] as unknown) : null;
  if (typeof premier !== 'object' || premier === null) {
    return null;
  }
  const { release_name: nom, binary } = premier as { release_name?: unknown; binary?: { package?: { link?: unknown; size?: unknown; checksum?: unknown } } };
  const paquet = binary?.package;
  const adresse = paquet?.link;
  const taille = paquet?.size;
  const empreinte = paquet?.checksum;
  if (
    typeof nom !== 'string' ||
    !/^jdk-?[\d.+]+$/.test(nom) ||
    typeof adresse !== 'string' ||
    !adresse.startsWith('https://github.com/adoptium/') ||
    !Number.isInteger(taille) ||
    (taille as number) <= 0 ||
    (taille as number) > 300_000_000 ||
    typeof empreinte !== 'string' ||
    !/^[0-9a-f]{64}$/.test(empreinte)
  ) {
    return null;
  }
  return { nom, adresse, taille: taille as number, empreinte };
}

/** Un port libre sur ce poste, choisi par le système. */
function portLibre(): Promise<number> {
  return new Promise((resoudre, rejeter) => {
    const serveur = createServer();
    serveur.once('error', rejeter);
    serveur.listen(0, '127.0.0.1', () => {
      const adresse = serveur.address();
      serveur.close(() => (typeof adresse === 'object' && adresse !== null ? resoudre(adresse.port) : rejeter(new Error('Aucun port libre.'))));
    });
  });
}

export interface Candidat {
  java: string;
  languagetool: string;
  ngrammes: string;
  /** Dossier de travail de l'essai. */
  preparation: string;
}

/**
 * Essaie une nouvelle version avant de l'installer : son Java lance son
 * LanguageTool sur un port libre, à côté du serveur en service, qui doit
 * trouver « fesait » dans une phrase. Rend null si l'essai passe, le message
 * sinon.
 */
export async function essayerCandidat({ java, languagetool, ngrammes, preparation }: Candidat): Promise<string | null> {
  const port = await portLibre();
  const reglages = join(preparation, 'essai.properties');
  await writeFile(reglages, reglagesDuServeur(join(ngrammes, '..')));
  const processus = spawn(
    join(java, 'bin', 'java'),
    ['-Xmx1g', '-cp', join(languagetool, 'languagetool-server.jar'), 'org.languagetool.server.HTTPServer', '--config', reglages, '--port', String(port)],
    {
      cwd: languagetool,
      env: { LC_ALL: 'C.UTF-8' },
      stdio: 'ignore',
    },
  );
  try {
    const adresse = `http://127.0.0.1:${port}`;
    const limite = Date.now() + delaiDEssaiMs;
    while (!(await estLanguageTool(adresse))) {
      if (Date.now() > limite || processus.exitCode !== null) {
        return 'la nouvelle version ne démarre pas';
      }
      await new Promise((resoudre) => setTimeout(resoudre, 500));
    }
    const fautes = await verifierTexte(adresse, { texte: 'Il fesait beau.', exclus: [] }, 60_000);
    return fautes?.some((faute) => faute.mot === 'fesait') === true ? null : 'la nouvelle version ne corrige pas';
  } finally {
    processus.kill('SIGKILL');
  }
}

export interface UpdaterDependencies {
  dossier: string;
  telecharger: Telecharger;
  /** Le serveur en service : arrêté le temps de remplacer les fichiers, puis relancé. */
  serveur: { arreter: () => Promise<void>; demarrer: () => Promise<void>; lireEtat: () => ServerState };
  surEtat: (etat: SpellcheckUpdate) => void;
  essayer?: (candidat: Candidat) => Promise<string | null>;
  maintenant?: () => number;
}

interface Journal {
  derniereVerification: number | null;
  message: string | null;
}

const fichierDuJournal = 'mise-a-jour.json';

/**
 * Mises à jour automatiques de LanguageTool et de son Java (choix d'Eloi,
 * README §11). Au plus une fois par jour : la nouvelle version est
 * téléchargée à côté, essayée sur un port à part, puis mise à la place de
 * l'ancienne et le serveur relancé. Si l'essai échoue, rien ne change ; si le
 * serveur ne redémarre pas, l'ancienne version revient. Java est vérifié par
 * l'empreinte que publie Adoptium ; LanguageTool n'en publie pas, il ne l'est
 * que par https et par l'essai. Les n-grammes n'ont qu'une version.
 */
export class LanguageToolUpdater {
  private journal: Journal = { derniereVerification: null, message: null };
  private enCours = false;

  constructor(private readonly dependances: UpdaterDependencies) {}

  async charger(): Promise<void> {
    try {
      const lu = JSON.parse(await readFile(join(this.dependances.dossier, fichierDuJournal), 'utf8')) as Partial<Journal>;
      this.journal = {
        derniereVerification: typeof lu.derniereVerification === 'number' ? lu.derniereVerification : null,
        message: typeof lu.message === 'string' ? lu.message : null,
      };
    } catch {
      this.journal = { derniereVerification: null, message: null };
    }
    this.annoncer();
  }

  etat(): SpellcheckUpdate {
    return { enCours: this.enCours, ...this.journal };
  }

  /** Cherche et installe une nouvelle version. Sans « forcer », pas plus d'une fois par jour. */
  async verifier(forcer = false): Promise<void> {
    const maintenant = (this.dependances.maintenant ?? Date.now)();
    if (this.enCours || (!forcer && this.journal.derniereVerification !== null && maintenant - this.journal.derniereVerification < intervalleDeVerificationMs)) {
      return;
    }
    const versions = await lireVersions(this.dependances.dossier);
    if (versions === null) {
      return;
    }
    this.enCours = true;
    this.annoncer();
    let message: string;
    try {
      message = await this.mettreAJour(versions);
    } catch (erreur) {
      message = `Mise à jour impossible : ${erreur instanceof Error ? erreur.message : 'erreur inconnue'}.`;
    }
    this.journal = { derniereVerification: maintenant, message };
    await writeFile(join(this.dependances.dossier, fichierDuJournal), `${JSON.stringify(this.journal)}\n`).catch(() => undefined);
    this.enCours = false;
    this.annoncer();
  }

  private async lireTexte(adresse: string): Promise<string> {
    const reponse = await this.dependances.telecharger(adresse, AbortSignal.timeout(30_000));
    if (!reponse.ok) {
      throw new Error(`pas de réponse de ${new URL(adresse).host}`);
    }
    return reponse.text();
  }

  /** Rend le message à montrer : à jour, mis à jour, ou version refusée. */
  private async mettreAJour(versions: InstalledVersions): Promise<string> {
    const { dossier, telecharger } = this.dependances;
    const languagetool = derniereVersionDeLanguageTool(await this.lireTexte(listeDesVersions));
    const lts = (JSON.parse(await this.lireTexte(versionsDeJava)) as { most_recent_lts?: unknown }).most_recent_lts;
    const java = Number.isInteger(lts) ? lireDerniereJava(JSON.parse(await this.lireTexte(derniereJava(lts as number)))) : null;
    if (languagetool === null || java === null) {
      throw new Error('les versions publiées sont illisibles');
    }
    const changerLanguageTool = comparerVersions(languagetool, versions.languagetool) > 0;
    const changerJava = java.nom !== versions.java;
    if (!changerLanguageTool && !changerJava) {
      return 'À jour.';
    }

    const preparation = `${dossier}.mise-a-jour`;
    await rm(preparation, { recursive: true, force: true });
    await mkdir(preparation, { recursive: true });
    const signal = AbortSignal.timeout(30 * 60_000);
    try {
      if (changerJava) {
        const archive = join(preparation, 'java.tar.gz');
        const empreinte = await telechargerVers(archive, { adresse: java.adresse, libelle: 'Java', taille: java.taille }, telecharger, signal);
        if (empreinte !== java.empreinte) {
          throw new Error("Java : le fichier reçu n'est pas celui publié (empreinte différente)");
        }
        await extraireTarGz({ fichier: archive, destination: join(preparation, 'java'), niveauxRetires: 1, surProgression: () => undefined, signal });
        await rm(archive);
      }
      if (changerLanguageTool) {
        const archive = join(preparation, 'languagetool.zip');
        const adresse = `${listeDesVersions}LanguageTool-${languagetool}.zip`;
        await telechargerVers(archive, { adresse, libelle: 'LanguageTool', tailleMax: tailleMaxDeLanguageTool }, telecharger, signal);
        await extraireZip({ fichier: archive, destination: join(preparation, 'languagetool'), niveauxRetires: 1, surProgression: () => undefined, signal });
        await rm(archive);
        await access(join(preparation, 'languagetool', 'languagetool-server.jar'));
      }
      const nouvelles: InstalledVersions = { ...versions, ...(changerJava ? { java: java.nom } : {}), ...(changerLanguageTool ? { languagetool } : {}) };
      const libelle = `LanguageTool ${nouvelles.languagetool}, Java ${versionLisibleDeJava(nouvelles.java)}`;
      const refus = await (this.dependances.essayer ?? essayerCandidat)({
        java: join(changerJava ? preparation : dossier, 'java'),
        languagetool: join(changerLanguageTool ? preparation : dossier, 'languagetool'),
        ngrammes: join(dossier, 'ngrammes'),
        preparation,
      });
      if (refus !== null) {
        return `${libelle} essayé et refusé (${refus}) : l'installation actuelle est gardée.`;
      }
      return await this.remplacer(preparation, versions, nouvelles, { java: changerJava, languagetool: changerLanguageTool }, libelle);
    } finally {
      await rm(preparation, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /** Met la nouvelle version à la place de l'ancienne et relance le serveur ; l'ancienne revient s'il ne redémarre pas. */
  private async remplacer(
    preparation: string,
    anciennes: InstalledVersions,
    nouvelles: InstalledVersions,
    changes: { java: boolean; languagetool: boolean },
    libelle: string,
  ): Promise<string> {
    const { dossier, serveur } = this.dependances;
    const parties = (['java', 'languagetool'] as const).filter((partie) => changes[partie]);
    await serveur.arreter();
    for (const partie of parties) {
      await rename(join(dossier, partie), join(preparation, `${partie}.ancien`));
      await rename(join(preparation, partie), join(dossier, partie));
    }
    await ecrireVersions(dossier, nouvelles);
    await serveur.demarrer();
    if (serveur.lireEtat() === 'pret') {
      return `Mis à jour : ${libelle}.`;
    }
    await serveur.arreter();
    for (const partie of parties) {
      await rm(join(dossier, partie), { recursive: true, force: true });
      await rename(join(preparation, `${partie}.ancien`), join(dossier, partie));
    }
    await ecrireVersions(dossier, anciennes);
    await serveur.demarrer();
    return `${libelle} installé mais le serveur n'a pas redémarré : l'ancienne version est revenue.`;
  }

  private annoncer(): void {
    this.dependances.surEtat(this.etat());
  }
}
