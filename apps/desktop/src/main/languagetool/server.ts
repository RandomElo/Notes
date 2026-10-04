import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';
import type { SpellcheckState } from '../../shared/ipc-contract';
import { verifierTexte } from './client';

/** Délai laissé au serveur pour répondre après son lancement (le premier démarrage charge les dictionnaires). */
const delaiDeDemarrageMs = 90_000;
const intervalleDAttenteMs = 250;

/**
 * Réglages du serveur. `pipelineCaching` est indispensable : sans lui, chaque
 * vérification en français reconstruit la règle d'orthographe et prend environ
 * 760 ms ; avec, 45 ms (mesures du 2026-10-04, README §11).
 */
export function reglagesDuServeur(dossierNgrammes: string): string {
  return [
    'pipelineCaching=true',
    'pipelinePrewarming=false',
    'maxPipelinePoolSize=50',
    'pipelineExpireTimeInSeconds=3600',
    'cacheSize=1000',
    `languageModel=${dossierNgrammes}`,
    '',
  ].join('\n');
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

const attendre = (ms: number): Promise<void> => new Promise((resoudre) => setTimeout(resoudre, ms));

export type ServerState = SpellcheckState['serveur'];

/**
 * Le serveur LanguageTool installé par Notes (README §11) : lancé par Notes,
 * avec le Java de l'installation (jamais celui du poste), sur un port libre de
 * 127.0.0.1 (sans `--public`, LanguageTool n'écoute que ce poste), sans les
 * variables d'environnement du poste. Arrêté quand Notes quitte.
 */
export class LanguageToolServer {
  private processus: ChildProcess | null = null;
  private port: number | null = null;
  private etat: ServerState = 'arrete';
  private arretDemande = false;

  constructor(
    private readonly dossier: string,
    private readonly surEtat: (etat: ServerState, erreur: string | null) => void,
  ) {}

  /** Adresse du serveur prêt, null sinon : la correction est alors désactivée sans bruit. */
  adresse(): string | null {
    return this.etat === 'pret' && this.port !== null ? `http://127.0.0.1:${this.port}` : null;
  }

  lireEtat(): ServerState {
    return this.etat;
  }

  async demarrer(): Promise<void> {
    if (this.processus !== null) {
      return;
    }
    this.arretDemande = false;
    this.changer('demarrage', null);
    try {
      const port = await portLibre();
      const reglages = join(this.dossier, 'server.properties');
      await writeFile(reglages, reglagesDuServeur(join(this.dossier, 'ngrammes')));
      const processus = spawn(
        join(this.dossier, 'java', 'bin', 'java'),
        ['-Xmx1g', '-cp', join(this.dossier, 'languagetool', 'languagetool-server.jar'), 'org.languagetool.server.HTTPServer', '--config', reglages, '--port', String(port)],
        // Ni les variables du poste (rien ne doit fuir vers Java), ni ses journaux, qui pourraient citer du texte des pages.
        { cwd: join(this.dossier, 'languagetool'), env: { LC_ALL: 'C.UTF-8' }, stdio: 'ignore' },
      );
      this.processus = processus;
      this.port = port;
      processus.once('error', () => this.surFin(processus));
      processus.once('exit', () => this.surFin(processus));
      await this.attendreLaReponse(port, processus);
    } catch (erreur) {
      this.arreter();
      this.changer('erreur', erreur instanceof Error ? erreur.message : 'LanguageTool ne démarre pas.');
    }
  }

  arreter(): void {
    this.arretDemande = true;
    this.processus?.kill('SIGTERM');
    this.processus = null;
    this.port = null;
    if (this.etat !== 'erreur') {
      this.changer('arrete', null);
    }
  }

  private surFin(processus: ChildProcess): void {
    if (this.processus !== processus) {
      return;
    }
    this.processus = null;
    this.port = null;
    if (!this.arretDemande) {
      this.changer('erreur', "LanguageTool s'est arrêté.");
    }
  }

  /** Attend que le serveur réponde, puis lui fait vérifier une phrase : le français est chargé avant la première frappe. */
  private async attendreLaReponse(port: number, processus: ChildProcess): Promise<void> {
    const adresse = `http://127.0.0.1:${port}`;
    const limite = Date.now() + delaiDeDemarrageMs;
    while (Date.now() < limite) {
      if (this.processus !== processus) {
        throw new Error('LanguageTool ne démarre pas.');
      }
      try {
        const reponse = await fetch(`${adresse}/v2/languages`, { signal: AbortSignal.timeout(2_000) });
        if (reponse.ok) {
          await verifierTexte(adresse, { texte: 'Bonjour.', exclus: [] }, 60_000);
          this.changer('pret', null);
          return;
        }
      } catch {
        // Pas encore à l'écoute.
      }
      await attendre(intervalleDAttenteMs);
    }
    throw new Error('LanguageTool ne répond pas.');
  }

  private changer(etat: ServerState, erreur: string | null): void {
    this.etat = etat;
    this.surEtat(etat, erreur);
  }
}
