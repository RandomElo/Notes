import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { availableParallelism } from 'node:os';

/**
 * Serveur whisper.cpp livré dans l'AppImage (README §13), lancé par Notes à
 * la première transcription, sur 127.0.0.1 et un port libre, et arrêté après
 * quelques minutes sans demande : la mémoire vidéo revient alors à Ollama.
 * Il ne reçoit aucune variable du poste, sauf de quoi trouver le pilote Vulkan.
 */

export type Lancer = (binaire: string, arguments_: string[], options: { env: NodeJS.ProcessEnv }) => ChildProcess;

export interface WhisperServerOptions {
  binaire: string;
  modele: string;
  /** Modèle de détection de la voix : seuls les passages parlés sont transcrits. */
  modeleDeVoix: string;
  lancer?: Lancer;
  /** Arrêt après ce délai sans demande. */
  inactiviteMs?: number;
  /** Délai pour charger le modèle et répondre. */
  demarrageMs?: number;
}

const lancerParDefaut: Lancer = (binaire, arguments_, { env }) => spawn(binaire, arguments_, { env, stdio: ['ignore', 'ignore', 'pipe'] });

/** Un port libre sur 127.0.0.1. */
export function portLibre(): Promise<number> {
  return new Promise((resoudre, rejeter) => {
    const serveur = createServer();
    serveur.once('error', rejeter);
    serveur.listen(0, '127.0.0.1', () => {
      const { port } = serveur.address() as AddressInfo;
      serveur.close(() => resoudre(port));
    });
  });
}

/** Ce que le serveur reçoit de l'environnement : de quoi trouver le pilote Vulkan, et la langue des messages. */
export function environnementDuServeur(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const garde: NodeJS.ProcessEnv = { PATH: '/usr/bin:/bin', LC_ALL: 'C.UTF-8' };
  for (const cle of ['HOME', 'XDG_RUNTIME_DIR', 'XDG_DATA_DIRS', 'VK_ICD_FILENAMES', 'VK_DRIVER_FILES']) {
    if (env[cle] !== undefined) {
      garde[cle] = env[cle];
    }
  }
  return garde;
}

export class WhisperServer {
  private processus: ChildProcess | null = null;
  private demarrage: Promise<string> | null = null;
  private minuteur: ReturnType<typeof setTimeout> | null = null;
  private dernieresLignes: string[] = [];
  private readonly lancer: Lancer;

  constructor(private readonly options: WhisperServerOptions) {
    this.lancer = options.lancer ?? lancerParDefaut;
  }

  /** Adresse du serveur, lancé s'il ne tourne pas ; repousse l'arrêt pour inactivité. */
  adresse(): Promise<string> {
    this.repousserLArret();
    this.demarrage ??= this.demarrer().catch((erreur: unknown) => {
      this.demarrage = null;
      throw erreur;
    });
    return this.demarrage;
  }

  enMarche(): boolean {
    return this.processus !== null;
  }

  arreter(): void {
    if (this.minuteur !== null) {
      clearTimeout(this.minuteur);
      this.minuteur = null;
    }
    this.processus?.kill('SIGTERM');
    this.processus = null;
    this.demarrage = null;
  }

  private repousserLArret(): void {
    if (this.minuteur !== null) {
      clearTimeout(this.minuteur);
    }
    this.minuteur = setTimeout(() => this.arreter(), this.options.inactiviteMs ?? 2 * 60_000);
    this.minuteur.unref?.();
  }

  private async demarrer(): Promise<string> {
    const port = await portLibre();
    const fils = Math.max(1, Math.min(8, availableParallelism() - 1));
    const processus = this.lancer(
      this.options.binaire,
      ['-m', this.options.modele, '--host', '127.0.0.1', '--port', String(port), '-l', 'fr', '-t', String(fils), '--vad', '-vm', this.options.modeleDeVoix, '--suppress-nst'],
      { env: environnementDuServeur(process.env) },
    );
    this.processus = processus;
    this.dernieresLignes = [];
    processus.stderr?.on('data', (morceau: Buffer) => {
      this.dernieresLignes = [...this.dernieresLignes, ...morceau.toString('utf8').split('\n').filter((ligne) => ligne.trim() !== '')].slice(-5);
    });
    let sorti = false;
    processus.once('exit', () => {
      sorti = true;
      if (this.processus === processus) {
        this.processus = null;
        this.demarrage = null;
      }
    });
    const adresse = `http://127.0.0.1:${port}`;
    const limite = Date.now() + (this.options.demarrageMs ?? 60_000);
    while (Date.now() < limite) {
      if (sorti) {
        throw new Error(`Le serveur de transcription s’est arrêté au démarrage. ${this.dernieresLignes.slice(-2).join(' ')}`.trim());
      }
      try {
        const reponse = await fetch(`${adresse}/`, { signal: AbortSignal.timeout(1000) });
        if (reponse.ok) {
          return adresse;
        }
      } catch {
        // Pas encore prêt : le modèle se charge.
      }
      await new Promise((resoudre) => setTimeout(resoudre, 250));
    }
    this.arreter();
    throw new Error('Le serveur de transcription n’a pas démarré à temps.');
  }
}
