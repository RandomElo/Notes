import { rm } from 'node:fs/promises';
import type { SpellcheckState, SpellcheckStep } from '../../shared/ipc-contract';
import { LanguageToolInstaller, estInstalle } from './installer';
import { LanguageToolServer } from './server';
import type { ServerState } from './server';

export interface SpellcheckServiceDependencies {
  /** Dossier de LanguageTool, à côté de l'AppImage. */
  dossier: string;
  telecharger: (adresse: string, signal: AbortSignal) => Promise<Response>;
  surEtat: (etat: SpellcheckState) => void;
  /**
   * Serveur déjà lancé ailleurs (essais de bout en bout, hors AppImage) : rien
   * n'est installé ni lancé, Notes s'adresse à lui.
   */
  adresseExterne?: string;
}

/**
 * Correction orthographique côté main (README §11) : installe LanguageTool à
 * la demande, le lance au démarrage de Notes s'il est installé, l'arrête quand
 * Notes quitte, et tient l'état montré par les réglages.
 */
export class SpellcheckService {
  private readonly installateur: LanguageToolInstaller;
  private readonly serveur: LanguageToolServer;
  private installation: SpellcheckState['installation'] = 'absente';
  private etapes: SpellcheckStep[] = [];
  private erreur: string | null = null;

  constructor(private readonly dependances: SpellcheckServiceDependencies) {
    this.installateur = new LanguageToolInstaller({
      dossier: dependances.dossier,
      telecharger: dependances.telecharger,
      surEtapes: (etapes) => {
        this.etapes = etapes;
        this.annoncer();
      },
    });
    this.serveur = new LanguageToolServer(dependances.dossier, (etat: ServerState, erreur) => {
      this.erreur = erreur;
      // Les étapes d'une installation restent affichées jusqu'au démarrage du serveur, qui en est la dernière.
      if (etat === 'pret') {
        this.etapes = [];
      }
      this.annoncer();
    });
  }

  /** Au lancement de Notes : démarre LanguageTool s'il est installé. Ne bloque rien. */
  async demarrer(): Promise<void> {
    if (this.dependances.adresseExterne !== undefined) {
      this.installation = 'installee';
      this.annoncer();
      return;
    }
    this.installation = (await estInstalle(this.dependances.dossier)) ? 'installee' : 'absente';
    this.annoncer();
    if (this.installation === 'installee') {
      await this.serveur.demarrer();
    }
  }

  arreter(): void {
    this.installateur.annuler();
    this.serveur.arreter();
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
    };
  }

  /** Lance l'installation et rend aussitôt l'état ; l'avancement est annoncé à mesure. */
  installer(): SpellcheckState {
    if (this.installation === 'absente' && this.dependances.adresseExterne === undefined) {
      this.installation = 'en_cours';
      this.erreur = null;
      void this.installateur.installer().then(async (erreur) => {
        this.installation = erreur === null ? 'installee' : 'absente';
        this.erreur = erreur;
        this.annoncer();
        if (erreur === null) {
          await this.serveur.demarrer();
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
      this.serveur.arreter();
      try {
        await rm(this.dependances.dossier, { recursive: true, force: true });
        this.installation = 'absente';
        this.erreur = null;
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
      this.serveur.arreter();
      this.erreur = null;
      void this.serveur.demarrer();
    }
    return this.etat();
  }

  private annoncer(): void {
    this.dependances.surEtat(this.etat());
  }
}
