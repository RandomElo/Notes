import { spawn } from 'node:child_process';
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { SpellcheckState } from '../../shared/ipc-contract';
import { verifierTexte } from './client';
import { contenuDuDemarrage, nomDesReglages, nomDuPid, nomDuScript, portDeLanguageTool, reglagesDuServeur, scriptDeLancement } from './launcher';

/** Délai laissé au serveur pour répondre après son lancement (le premier démarrage charge les dictionnaires). */
const delaiDeDemarrageMs = 90_000;
const intervalleDAttenteMs = 250;
/** Après un échec de vérification, on ne regarde pas l'état du serveur plus souvent que ça. */
const intervalleDeSanteMs = 30_000;

const attendre = (ms: number): Promise<void> => new Promise((resoudre) => setTimeout(resoudre, ms));

export type ServerState = SpellcheckState['serveur'];

export interface ServerDependencies {
  /** Dossier de LanguageTool. */
  dossier: string;
  /** Fichier de démarrage avec la session (`~/.config/autostart/notes-languagetool.desktop`). */
  demarrageDeSession: string;
  surEtat: (etat: ServerState, erreur: string | null) => void;
  /** Lance le script, détaché : il survit à Notes. */
  lancerScript?: (script: string) => void;
  port?: number;
}

/** Vrai si un LanguageTool répond à cette adresse (et pas un autre programme sur le même port). */
export async function estLanguageTool(adresse: string): Promise<boolean> {
  try {
    const reponse = await fetch(`${adresse}/v2/languages`, { signal: AbortSignal.timeout(2_000) });
    const langues = (await reponse.json()) as unknown;
    return (
      reponse.ok && Array.isArray(langues) && langues.some((langue) => typeof langue === 'object' && langue !== null && (langue as { code?: unknown }).code === 'fr')
    );
  } catch {
    return false;
  }
}

/** Lance le script par bash, détaché, sans aucune variable de Notes ni de l'AppImage. */
function lancerDetache(script: string): void {
  spawn('/bin/bash', [script], { detached: true, stdio: 'ignore', env: {} }).unref();
}

/**
 * Le serveur LanguageTool installé par Notes (README §11). Il tourne pour
 * toute la session, pas seulement pour Notes : l'extension LanguageTool du
 * navigateur s'en sert aussi. La session le lance au login ; Notes le lance si
 * elle ne le trouve pas, et le relance s'il s'est arrêté. Notes ne l'arrête
 * jamais en quittant, seulement pour le relancer ou le désinstaller.
 */
export class LanguageToolServer {
  private etat: ServerState = 'arrete';
  private derniereSante = 0;
  private enCours: Promise<void> | null = null;
  private readonly port: number;
  private readonly lancerScript: (script: string) => void;

  constructor(private readonly dependances: ServerDependencies) {
    this.port = dependances.port ?? portDeLanguageTool;
    this.lancerScript = dependances.lancerScript ?? lancerDetache;
  }

  private get adresseDuServeur(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  /** Adresse du serveur prêt, null sinon : la correction est alors désactivée sans bruit. */
  adresse(): string | null {
    return this.etat === 'pret' ? this.adresseDuServeur : null;
  }

  lireEtat(): ServerState {
    return this.etat;
  }

  /**
   * Écrit le script, les réglages et le démarrage avec la session (à jour avec
   * cette version de Notes), puis s'assure que le serveur tourne.
   */
  demarrer(): Promise<void> {
    this.enCours ??= this.preparerEtLancer().finally(() => {
      this.enCours = null;
    });
    return this.enCours;
  }

  /** Une vérification n'a pas eu de réponse : si le serveur s'est arrêté, on le relance. */
  signalerEchec(): void {
    const maintenant = Date.now();
    if (this.enCours !== null || maintenant - this.derniereSante < intervalleDeSanteMs) {
      return;
    }
    this.derniereSante = maintenant;
    void estLanguageTool(this.adresseDuServeur).then((repond) => {
      if (!repond) {
        void this.demarrer();
      }
    });
  }

  /** Arrête le serveur lancé par le script (pour le relancer ou le désinstaller). */
  async arreter(): Promise<void> {
    const pid = Number((await readFile(join(this.dependances.dossier, nomDuPid), 'utf8').catch(() => '')).trim());
    if (Number.isInteger(pid) && pid > 0) {
      const commande = await readFile(`/proc/${pid}/cmdline`, 'utf8').catch(() => '');
      // Seulement si c'est bien notre serveur : un numéro de processus peut avoir été repris par un autre programme.
      if (commande.includes('languagetool-server') && commande.includes(this.dependances.dossier)) {
        process.kill(pid, 'SIGTERM');
        const limite = Date.now() + 10_000;
        while (Date.now() < limite && (await readFile(`/proc/${pid}/cmdline`, 'utf8').catch(() => '')) !== '') {
          await attendre(intervalleDAttenteMs);
        }
      }
    }
    await rm(join(this.dependances.dossier, nomDuPid), { force: true });
    this.changer('arrete', null);
  }

  /** Retire le démarrage avec la session (désinstallation). */
  async retirerDuDemarrage(): Promise<void> {
    await rm(this.dependances.demarrageDeSession, { force: true });
  }

  private async preparerEtLancer(): Promise<void> {
    const { dossier, demarrageDeSession } = this.dependances;
    this.changer('demarrage', null);
    try {
      const script = join(dossier, nomDuScript);
      await writeFile(join(dossier, nomDesReglages), reglagesDuServeur(dossier));
      await writeFile(script, scriptDeLancement());
      await chmod(script, 0o755);
      await mkdir(dirname(demarrageDeSession), { recursive: true });
      await writeFile(demarrageDeSession, contenuDuDemarrage(dossier), { mode: 0o644 });
      if (!(await estLanguageTool(this.adresseDuServeur))) {
        this.lancerScript(script);
        await this.attendreLaReponse();
      }
      // Le français est chargé avant la première frappe.
      await verifierTexte(this.adresseDuServeur, { texte: 'Bonjour.', exclus: [] }, 60_000);
      this.changer('pret', null);
    } catch (erreur) {
      this.changer('erreur', erreur instanceof Error ? erreur.message : 'LanguageTool ne démarre pas.');
    }
  }

  private async attendreLaReponse(): Promise<void> {
    const limite = Date.now() + delaiDeDemarrageMs;
    while (Date.now() < limite) {
      if (await estLanguageTool(this.adresseDuServeur)) {
        return;
      }
      await attendre(intervalleDAttenteMs);
    }
    throw new Error(`LanguageTool ne répond pas sur le port ${this.port}. Un autre programme l'occupe peut-être.`);
  }

  private changer(etat: ServerState, erreur: string | null): void {
    this.etat = etat;
    this.dependances.surEtat(etat, erreur);
  }
}
