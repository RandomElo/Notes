import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { cheminDeMemoValide, creerPageDeMemo, dossierDesMemos, dateDuNom, listerMemos, mettreMemoALaCorbeille, pageDesMemos, pageDesMemosMasquee, titreDuMemo, trouverPageDesMemos } from '@notes/core';
import type { MemoAcceptance, MemoConversion, MemosState, MemoTranscription, WhisperState } from '../../shared/memos-contract';
import type { SettingsStore } from '../settings/settings-store';
import type { VaultService } from '../vault/vault-service';
import { estWav } from '../whisper/client';
import type { WhisperService } from '../whisper/whisper-service';
import { champs } from './vault';

export interface MemosHandlersDependencies {
  vault: VaultService;
  /** File des opérations du vault : les mémos, leurs pages et la corbeille sont dans le dossier des notes. */
  enSerie: <T>(tache: () => Promise<T>) => Promise<T>;
  reglages: SettingsStore;
  whisper: Pick<WhisperService, 'etat' | 'installerModele' | 'annulerInstallation' | 'transcrire'>;
  /** Le ffmpeg livré avec Notes : un fichier audio (chemin absolu) en WAV 16 kHz mono. */
  convertir: (fichier: string) => Promise<Uint8Array>;
  /** Ouvre un dossier dans le gestionnaire de fichiers. Rend un message d'erreur, vide si c'est fait. */
  ouvrirDossier: (dossier: string) => Promise<string>;
}

/** Plus gros fichier audio lu pour l'écoute : un mémo d'une heure en AAC tient largement dedans. */
const tailleMaxDUnMemo = 200 * 1024 * 1024;

/**
 * Handlers des canaux « memos: » (README §13). Les entrées viennent du
 * renderer : seul un fichier audio directement dans `.notes/memos/` est
 * accepté, rien d'autre du dossier des notes n'est lu ni déplacé par ici.
 */
export function creerHandlersMemos({ vault, enSerie, reglages, whisper, convertir, ouvrirDossier }: MemosHandlersDependencies) {
  // Le modèle se télécharge de lui-même au premier mémo (choix d'Eloi, 2026-10-08), une fois par lancement :
  // après un échec, c'est le bouton qui relance.
  let telechargementAutomatiqueFait = false;

  const etat = (): Promise<MemosState> =>
    enSerie(async () => {
      const vide = { memos: [], page: null, masquee: false, whisper: whisper.etat() };
      let contexte;
      try {
        contexte = vault.contexte();
      } catch {
        return vide;
      }
      const memos = await listerMemos(contexte);
      if (memos.length > 0 && !telechargementAutomatiqueFait && whisper.etat().binaire && whisper.etat().modele === 'absent') {
        telechargementAutomatiqueFait = true;
        whisper.installerModele();
      }
      // La page apparaît avec le premier mémo (README §13).
      const page = memos.length > 0 ? await pageDesMemos(contexte) : await trouverPageDesMemos(contexte);
      let masques = (await reglages.lire()).memosMasques;
      if (masques !== null && !pageDesMemosMasquee(masques, memos)) {
        // Un nouveau mémo fait réapparaître la page masquée.
        masques = null;
        await reglages.ecrire({ ...(await reglages.lire()), memosMasques: null });
      }
      return {
        memos: memos.map((memo) => ({ ...memo, titre: titreDuMemo(memo.date) })),
        page,
        masquee: masques !== null,
        whisper: whisper.etat(),
      };
    });

  return {
    etat,

    masquer: async (demande: unknown): Promise<MemosState> => {
      const { masquer } = champs(demande);
      if (typeof masquer === 'boolean') {
        const memos = await enSerie(async () => {
          try {
            return await listerMemos(vault.contexte());
          } catch {
            return [];
          }
        });
        await reglages.ecrire({ ...(await reglages.lire()), memosMasques: masquer ? memos.map((memo) => memo.nom) : null });
      }
      return etat();
    },

    /** Octets d'un mémo, pour l'écouter ou le convertir. null s'il n'existe pas. */
    lire: async (demande: unknown): Promise<Uint8Array | null> => {
      const { chemin } = champs(demande);
      if (!cheminDeMemoValide(chemin)) {
        return null;
      }
      return enSerie(async () => {
        try {
          const { fs } = vault.contexte();
          const infos = await fs.infos(chemin);
          return infos === null || infos.estDossier || infos.taille > tailleMaxDUnMemo ? null : await fs.lireOctets(chemin);
        } catch {
          return null;
        }
      });
    },

    /** Un mémo que Chromium ne lit pas (AMR, WMA, AIFF…), décodé par ffmpeg en WAV 16 kHz mono, avec sa durée. */
    convertir: async (demande: unknown): Promise<MemoConversion> => {
      const { chemin } = champs(demande);
      const dossier = vault.etat().dossier;
      if (!cheminDeMemoValide(chemin) || dossier === null) {
        return { ok: false, message: 'Ce mémo n’est plus là.' };
      }
      try {
        const wav = await convertir(join(dossier, chemin));
        // 16 000 échantillons de 2 octets par seconde, après l'en-tête de 44 octets.
        return { ok: true, wav, duree: (wav.length - 44) / 32_000 };
      } catch (erreur) {
        return { ok: false, message: erreur instanceof Error ? erreur.message : 'Cet audio ne se lit pas.' };
      }
    },

    /** Ouvre `.notes/memos/` du dossier des notes dans le gestionnaire de fichiers, en le créant s'il manque. */
    ouvrirDossier: async (): Promise<{ ok: true } | { ok: false; message: string }> => {
      const dossier = vault.etat().dossier;
      if (dossier === null) {
        return { ok: false, message: 'Aucun dossier des notes n’est choisi.' };
      }
      const memos = join(dossier, dossierDesMemos);
      try {
        await mkdir(memos, { recursive: true });
      } catch {
        return { ok: false, message: 'Le dossier des mémos n’a pas pu être créé.' };
      }
      const erreur = await ouvrirDossier(memos);
      return erreur === '' ? { ok: true } : { ok: false, message: 'Le gestionnaire de fichiers ne s’est pas ouvert.' };
    },

    /** Le WAV 16 kHz mono d'un mémo, converti par la page, part au serveur de transcription. */
    transcrire: (demande: unknown): Promise<MemoTranscription> => {
      const { wav } = champs(demande);
      if (!estWav(wav)) {
        return Promise.resolve({ ok: false, message: 'Audio illisible.' });
      }
      return whisper.transcrire(wav);
    },

    /** Crée la sous-page du mémo avec le texte accepté, puis met l'audio à la corbeille. */
    accepter: (demande: unknown): Promise<MemoAcceptance> => {
      const { chemin, corps } = champs(demande);
      if (!cheminDeMemoValide(chemin) || typeof corps !== 'string' || corps.trim() === '' || corps.length > 1_000_000) {
        return Promise.resolve({ ok: false, message: 'Demande illisible.' });
      }
      return enSerie(async () => {
        try {
          const contexte = vault.contexte();
          const memo = (await listerMemos(contexte)).find((candidat) => candidat.chemin === chemin);
          if (memo === undefined) {
            return { ok: false, message: 'Ce mémo n’est plus là (déjà transcrit ou mis à la corbeille ?).' };
          }
          const page = await creerPageDeMemo(contexte, memo, corps);
          await mettreMemoALaCorbeille(contexte, chemin, titreDuMemo(memo.date));
          return { ok: true, chemin: page.chemin, id: page.id };
        } catch (erreur) {
          return { ok: false, message: erreur instanceof Error ? erreur.message : 'Le mémo n’a pas pu être rangé.' };
        }
      });
    },

    /** Met un mémo à la corbeille sans le transcrire. */
    ecarter: (demande: unknown): Promise<MemosState> => {
      const { chemin } = champs(demande);
      if (!cheminDeMemoValide(chemin)) {
        return etat();
      }
      return enSerie(async () => {
        try {
          const date = dateDuNom(chemin.slice(chemin.lastIndexOf('/') + 1));
          await mettreMemoALaCorbeille(vault.contexte(), chemin, date === null ? chemin.slice(chemin.lastIndexOf('/') + 1) : titreDuMemo(date));
        } catch {
          // Déjà parti : l'état relu le dira.
        }
      }).then(etat);
    },

    installerModele: (): WhisperState => whisper.installerModele(),
    annulerInstallation: (): void => whisper.annulerInstallation(),
  };
}
