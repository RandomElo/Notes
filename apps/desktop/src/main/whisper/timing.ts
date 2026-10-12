import { readFile, rename, writeFile } from 'node:fs/promises';

/**
 * Durée d'une transcription, estimée avant de la lancer (README §13, demande
 * d'Eloi du 2026-10-11). Calée sur les dernières transcriptions de ce poste :
 * la vitesse dépend de la carte graphique, donc l'historique reste sur le
 * poste, pas dans le dossier des notes.
 */
export interface TranscriptionMeasure {
  /** Durée de l'audio. */
  audioMs: number;
  /** Durée de la transcription, sans le démarrage du serveur. */
  transcriptionMs: number;
  /** Démarrage du serveur (chargement du modèle) quand il était arrêté, null sinon. */
  demarrageMs: number | null;
  /** Longueur du texte obtenu, pour estimer la mise en forme avant la transcription. */
  caracteres: number;
}

export interface TranscriptionCalibration {
  /** Millisecondes de transcription par milliseconde d'audio. */
  parMsDAudio: number;
  /** Caractères transcrits par seconde d'audio. */
  caracteresParSeconde: number;
  demarrageMs: number;
  /** Mesures sur lesquelles le calage repose ; 0 : valeurs par défaut. */
  mesuresConnues: number;
}

/** Mesures gardées : les plus récentes suivent un changement de carte ou de modèle. */
export const mesuresGardees = 10;

/** Avant toute mesure : large-v3-turbo sur une carte dédiée, ou sur le processeur. */
const parMsDAudioAvecCarte = 1 / 15;
const parMsDAudioSansCarte = 1 / 2;
/** Environ 150 mots par minute en français parlé. */
const caracteresParSecondeParDefaut = 15;
const demarrageParDefautMs = 5000;
/** Envoi du WAV et réponse, quelle que soit la durée de l'audio. */
const fraisFixesMs = 300;

function mediane(valeurs: number[]): number | null {
  if (valeurs.length === 0) {
    return null;
  }
  const triees = [...valeurs].sort((a, b) => a - b);
  const milieu = Math.floor(triees.length / 2);
  return triees.length % 2 === 1 ? triees[milieu]! : (triees[milieu - 1]! + triees[milieu]!) / 2;
}

/** Le calage des dernières mesures ; valeurs par défaut selon la carte quand il n'y en a pas. */
export function calerTranscription(mesures: readonly TranscriptionMeasure[], avecCarte: boolean): TranscriptionCalibration {
  const utiles = mesures.filter((mesure) => mesure.audioMs >= 1000).slice(-mesuresGardees);
  const demarrages = mesures.flatMap((mesure) => (mesure.demarrageMs === null ? [] : [mesure.demarrageMs])).slice(-mesuresGardees);
  return {
    parMsDAudio: mediane(utiles.map((mesure) => Math.max(0, mesure.transcriptionMs - fraisFixesMs) / mesure.audioMs)) ?? (avecCarte ? parMsDAudioAvecCarte : parMsDAudioSansCarte),
    caracteresParSeconde: mediane(utiles.map((mesure) => mesure.caracteres / (mesure.audioMs / 1000))) ?? caracteresParSecondeParDefaut,
    demarrageMs: mediane(demarrages) ?? demarrageParDefautMs,
    mesuresConnues: utiles.length,
  };
}

/** Durée estimée de la transcription d'un audio, démarrage du serveur compris s'il est arrêté. */
export function dureeDeTranscription(calage: TranscriptionCalibration, audioMs: number, serveurArrete: boolean): number {
  return Math.round(fraisFixesMs + calage.parMsDAudio * audioMs + (serveurArrete ? calage.demarrageMs : 0));
}

/** Longueur probable du texte d'un audio, pour estimer sa mise en forme avant de le transcrire. */
export function caracteresProbables(calage: TranscriptionCalibration, audioMs: number): number {
  return Math.round(calage.caracteresParSeconde * (audioMs / 1000));
}

/** Durée d'un WAV PCM 16 bits mono à 16 kHz, en millisecondes. */
export function dureeDuWav(wav: Uint8Array): number {
  return Math.max(0, wav.length - 44) / 32;
}

const estUneMesure = (valeur: unknown): valeur is TranscriptionMeasure => {
  if (typeof valeur !== 'object' || valeur === null) {
    return false;
  }
  const { audioMs, transcriptionMs, demarrageMs, caracteres } = valeur as Record<string, unknown>;
  const positif = (nombre: unknown): boolean => typeof nombre === 'number' && Number.isFinite(nombre) && nombre >= 0;
  return positif(audioMs) && positif(transcriptionMs) && positif(caracteres) && (demarrageMs === null || positif(demarrageMs));
};

/** Les mesures de ce poste, dans un petit fichier à côté des réglages. Un fichier abîmé vaut une liste vide. */
export class TranscriptionMeasures {
  constructor(private readonly fichier: string) {}

  async lire(): Promise<TranscriptionMeasure[]> {
    try {
      const contenu: unknown = JSON.parse(await readFile(this.fichier, 'utf8'));
      return Array.isArray(contenu) ? contenu.filter(estUneMesure).slice(-mesuresGardees) : [];
    } catch {
      return [];
    }
  }

  async ajouter(mesure: TranscriptionMeasure): Promise<void> {
    const mesures = [...(await this.lire()), mesure].slice(-mesuresGardees);
    const temporaire = `${this.fichier}.tmp`;
    await writeFile(temporaire, JSON.stringify(mesures), 'utf8');
    await rename(temporaire, this.fichier);
  }
}
