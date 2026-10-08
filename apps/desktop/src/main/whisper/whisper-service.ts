import { access, constants } from 'node:fs/promises';
import type { MemoTranscription, WhisperState } from '../../shared/memos-contract';
import type { Telecharger } from '../languagetool/download';
import { transcrireWav } from './client';
import { cheminDuModele, modeleDeVoix, modeleInstalle, tailleDesModeles, telechargerModele } from './model';
import { WhisperServer } from './server';
import type { Lancer } from './server';

export interface WhisperServiceOptions {
  /** Dossier du modèle (`model.ts`). */
  dossier: string;
  /** Le serveur livré avec Notes. */
  binaire: string;
  telecharger: Telecharger;
  surEtat: (etat: WhisperState) => void;
  /** Nom de la carte dédiée qui fera la transcription, null sans carte dédiée. */
  carte: () => Promise<string | null>;
  /** Un serveur déjà lancé (essais de bout en bout) : ni modèle ni binaire à chercher. */
  adresseExterne?: string;
  lancer?: Lancer;
}

/**
 * Transcription des mémos (README §13) : Notes s'occupe de tout (choix
 * d'Eloi, 2026-10-07). Le serveur est dans l'AppImage ; le modèle se
 * télécharge une fois, à la demande ; le serveur se lance à la première
 * transcription et s'arrête de lui-même après quelques minutes.
 */
export class WhisperService {
  private binairePresent = false;
  private modele: WhisperState['modele'] = 'absent';
  private recus = 0;
  private erreur: string | null = null;
  private carte: string | null = null;
  private telechargement: AbortController | null = null;
  private serveur: WhisperServer | null = null;

  constructor(private readonly options: WhisperServiceOptions) {}

  /** Relit l'état du disque : binaire, modèle, carte. */
  async demarrer(): Promise<void> {
    this.carte = await this.options.carte().catch(() => null);
    if (this.options.adresseExterne !== undefined) {
      this.binairePresent = true;
      this.modele = 'pret';
    } else {
      this.binairePresent = await access(this.options.binaire, constants.X_OK).then(
        () => true,
        () => false,
      );
      this.modele = (await modeleInstalle(this.options.dossier)) ? 'pret' : 'absent';
    }
    this.publier();
  }

  etat(): WhisperState {
    return {
      binaire: this.binairePresent,
      modele: this.modele,
      recus: this.recus,
      total: tailleDesModeles,
      serveur: this.serveur?.enMarche() === true || this.options.adresseExterne !== undefined ? 'pret' : 'arrete',
      carte: this.carte,
      erreur: this.erreur,
      dossier: this.options.dossier,
    };
  }

  private publier(): void {
    this.options.surEtat(this.etat());
  }

  /** Télécharge le modèle, sans attendre la fin : l'avancement arrive par `surEtat`. */
  installerModele(): WhisperState {
    if (this.modele !== 'absent' || this.options.adresseExterne !== undefined) {
      return this.etat();
    }
    const controleur = new AbortController();
    this.telechargement = controleur;
    this.modele = 'telechargement';
    this.recus = 0;
    this.erreur = null;
    let dernierePublication = 0;
    void telechargerModele(this.options.dossier, this.options.telecharger, controleur.signal, (recus) => {
      this.recus = recus;
      // Pas plus de quatre nouvelles par seconde vers la fenêtre.
      if (Date.now() - dernierePublication > 250) {
        dernierePublication = Date.now();
        this.publier();
      }
    })
      .then(() => {
        this.modele = 'pret';
      })
      .catch((erreur: unknown) => {
        this.modele = 'absent';
        this.erreur = controleur.signal.aborted ? null : erreur instanceof Error ? erreur.message : 'Le téléchargement du modèle a échoué.';
      })
      .finally(() => {
        this.telechargement = null;
        this.publier();
      });
    this.publier();
    return this.etat();
  }

  annulerInstallation(): void {
    this.telechargement?.abort();
  }

  async transcrire(wav: Uint8Array): Promise<MemoTranscription> {
    if (!this.binairePresent) {
      return { ok: false, message: 'Le serveur de transcription manque à cette version de Notes.' };
    }
    if (this.modele !== 'pret') {
      return { ok: false, message: 'Le modèle de transcription n’est pas encore téléchargé.' };
    }
    const debut = Date.now();
    try {
      let adresse = this.options.adresseExterne;
      if (adresse === undefined) {
        this.serveur ??= new WhisperServer({ binaire: this.options.binaire, modele: cheminDuModele(this.options.dossier), modeleDeVoix: cheminDuModele(this.options.dossier, modeleDeVoix),...(this.options.lancer === undefined ? {} : { lancer: this.options.lancer }) });
        adresse = await this.serveur.adresse();
        this.erreur = null;
        this.publier();
      }
      const texte = await transcrireWav(adresse, wav);
      return { ok: true, texte, dureeMs: Date.now() - debut };
    } catch (erreur) {
      this.erreur = erreur instanceof Error ? erreur.message : 'La transcription a échoué.';
      this.publier();
      return { ok: false, message: this.erreur };
    }
  }

  arreter(): void {
    this.telechargement?.abort();
    this.serveur?.arreter();
  }
}
