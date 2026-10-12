import { rm } from 'node:fs/promises';
import type { SpellcheckState, SpellcheckStep } from '../../shared/ipc-contract';
import { lireCapacite, raisonDeRefus } from './capacity';
import type { MachineCapacity } from './capacity';
import { LanguageToolInstaller, estInstalle } from './installer';
import { LanguageToolServer } from './server';
import type { ServerState } from './server';
import { LanguageToolUpdater } from './updater';
import { lireVersions, versionLisibleDeJava } from './versions';
import type { InstalledVersions } from './versions';

/** Intervalle entre deux passages du vérificateur de mises à jour, qui ne cherche lui-même qu'une fois par jour. */
const intervalleDesMisesAJourMs = 6 * 3600 * 1000;

export interface SpellcheckServiceDependencies {
  /** Dossier de LanguageTool, à côté de l'AppImage. */
  dossier: string;
  /** Fichier de démarrage avec la session (`~/.config/autostart/notes-languagetool.desktop`). */
  demarrageDeSession: string;
  telecharger: (adresse: string, signal: AbortSignal) => Promise<Response>;
  surEtat: (etat: SpellcheckState) => void;
  /**
   * Serveur déjà lancé ailleurs (essais de bout en bout, hors AppImage) : rien
   * n'est installé ni lancé, Notes s'adresse à lui.
   */
  adresseExterne?: string;
  /** Mémoire et place libre du poste (essais) ; par défaut, celles du poste réel. */
  capacite?: (dossier: string) => Promise<MachineCapacity>;
}

/**
 * Correction orthographique côté main (docs/spec/correction.md) : installe LanguageTool à
 * la demande, le fait démarrer avec la session, le lance au démarrage de Notes
 * s'il ne tourne pas (sans jamais l'arrêter en quittant : l'extension du
 * navigateur s'en sert aussi), et tient l'état montré par les réglages.
 */
export class SpellcheckService {
  private readonly installateur: LanguageToolInstaller;
  private readonly serveur: LanguageToolServer;
  private installation: SpellcheckState['installation'] = 'absente';
  private etapes: SpellcheckStep[] = [];
  private erreur: string | null = null;
  private versions: InstalledVersions | null = null;
  /** Pourquoi le poste ne permet pas d'installer LanguageTool, null s'il le permet. */
  private refus: string | null = null;
  private readonly miseAJour: LanguageToolUpdater;
  private minuteurDesMisesAJour: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly dependances: SpellcheckServiceDependencies) {
    this.installateur = new LanguageToolInstaller({
      dossier: dependances.dossier,
      telecharger: dependances.telecharger,
      surEtapes: (etapes) => {
        this.etapes = etapes;
        this.annoncer();
      },
    });
    this.serveur = new LanguageToolServer({
      dossier: dependances.dossier,
      demarrageDeSession: dependances.demarrageDeSession,
      surEtat: (etat: ServerState, erreur) => {
        this.erreur = erreur;
        // Les étapes d'une installation restent affichées jusqu'au démarrage du serveur, qui en est la dernière.
        if (etat === 'pret') {
          this.etapes = [];
        }
        this.annoncer();
      },
    });
    this.miseAJour = new LanguageToolUpdater({
      dossier: dependances.dossier,
      telecharger: dependances.telecharger,
      serveur: this.serveur,
      // Après une mise à jour, les versions affichées changent.
      surEtat: () => {
        void lireVersions(dependances.dossier).then((versions) => {
          this.versions = versions;
          this.annoncer();
        });
      },
    });
  }

  /** LanguageTool installé et lancé : mises à jour cherchées tout de suite, puis régulièrement (au plus une fois par jour). */
  private async servir(): Promise<void> {
    this.versions = await lireVersions(this.dependances.dossier);
    await this.miseAJour.charger();
    await this.serveur.demarrer();
    void this.miseAJour.verifier();
    clearInterval(this.minuteurDesMisesAJour);
    this.minuteurDesMisesAJour = setInterval(() => void this.miseAJour.verifier(), intervalleDesMisesAJourMs);
  }

  /** Au lancement de Notes : démarre LanguageTool s'il est installé. Ne bloque rien. */
  async demarrer(): Promise<void> {
    if (this.dependances.adresseExterne !== undefined) {
      this.installation = 'installee';
      this.annoncer();
      return;
    }
    this.installation = (await estInstalle(this.dependances.dossier)) ? 'installee' : 'absente';
    if (this.installation === 'absente') {
      this.refus = await this.verifierLePoste();
    }
    this.annoncer();
    if (this.installation === 'installee') {
      await this.servir();
    }
  }

  /** Pourquoi le poste ne permet pas l'installation, null s'il la permet. Une capacité illisible ne bloque rien. */
  private async verifierLePoste(): Promise<string | null> {
    const lire = this.dependances.capacite ?? lireCapacite;
    return lire(this.dependances.dossier).then(raisonDeRefus, () => null);
  }

  /** Notes quitte : une installation en cours s'arrête. Le serveur, lui, continue de tourner. */
  arreter(): void {
    this.installateur.annuler();
    clearInterval(this.minuteurDesMisesAJour);
  }

  /** Cherche une mise à jour tout de suite (bouton des réglages). */
  chercherMiseAJour(): SpellcheckState {
    if (this.installation === 'installee' && this.dependances.adresseExterne === undefined) {
      void this.miseAJour.verifier(true);
    }
    return this.etat();
  }

  /** Une vérification est restée sans réponse : le serveur est relancé s'il s'est arrêté. */
  signalerEchec(): void {
    if (this.installation === 'installee' && this.dependances.adresseExterne === undefined) {
      this.serveur.signalerEchec();
    }
  }

  /** Adresse du serveur prêt, null sinon. */
  adresse(): string | null {
    return this.dependances.adresseExterne ?? this.serveur.adresse();
  }

  etat(): SpellcheckState {
    return {
      installation: this.installation,
      serveur: this.dependances.adresseExterne === undefined ? this.serveur.lireEtat() : 'pret',
      dossier: this.dependances.dossier,
      taille: this.installateur.tailleTotale,
      etapes: this.etapes,
      erreur: this.erreur,
      versions: this.versions === null ? null : { languagetool: this.versions.languagetool, java: versionLisibleDeJava(this.versions.java) },
      miseAJour: this.miseAJour.etat(),
      refus: this.installation === 'absente' ? this.refus : null,
    };
  }

  /** Lance l'installation et rend aussitôt l'état ; l'avancement est annoncé à mesure. */
  installer(): SpellcheckState {
    if (this.installation === 'absente' && this.refus === null && this.dependances.adresseExterne === undefined) {
      this.installation = 'en_cours';
      this.erreur = null;
      void this.installateur.installer().then(async (erreur) => {
        this.installation = erreur === null ? 'installee' : 'absente';
        this.erreur = erreur;
        this.annoncer();
        if (erreur === null) {
          await this.servir();
        }
      });
    }
    return this.etat();
  }

  annulerInstallation(): void {
    this.installateur.annuler();
  }

  async desinstaller(): Promise<SpellcheckState> {
    if (this.installation === 'installee' && this.dependances.adresseExterne === undefined) {
      try {
        await this.serveur.arreter();
        await this.serveur.retirerDuDemarrage();
        clearInterval(this.minuteurDesMisesAJour);
        this.versions = null;
        await rm(this.dependances.dossier, { recursive: true, force: true });
        this.installation = 'absente';
        this.erreur = null;
        this.refus = await this.verifierLePoste();
      } catch {
        this.erreur = `Le dossier ${this.dependances.dossier} n'a pas pu être supprimé.`;
      }
      this.annoncer();
    }
    return this.etat();
  }

  /** Relance après un arrêt imprévu ; rend aussitôt l'état, le démarrage est annoncé à mesure. */
  relancer(): SpellcheckState {
    if (this.installation === 'installee' && this.dependances.adresseExterne === undefined) {
      this.erreur = null;
      void this.serveur.arreter().then(() => this.serveur.demarrer());
    }
    return this.etat();
  }

  private annoncer(): void {
    this.dependances.surEtat(this.etat());
  }
}
