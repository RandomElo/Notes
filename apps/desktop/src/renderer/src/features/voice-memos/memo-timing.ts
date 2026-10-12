import type { MemoEstimate } from '../../../../shared/memos-contract';
import { libelleDeDuree, libelleDeTempsRestant } from '../ai/ai-labels';

/**
 * Temps restant d'une transcription de mémos (docs/spec/memos.md, demande d'Eloi du
 * 2026-10-11) : transcription puis mise en forme, d'après les estimations du
 * main. `complet` est faux quand une partie n'a pas pu être estimée (IA locale
 * jamais utilisée) : le temps affiché le dit.
 */
export interface Duration {
  ms: number;
  complet: boolean;
}

export type MemoStep = 'lecture' | 'transcription' | 'mise-en-forme';

/** Durées d'un mémo : null quand la durée de son audio est inconnue. */
export interface MemoDurations {
  transcriptionMs: number | null;
  miseEnFormeMs: number | null;
}

/** Les mémos à venir, le démarrage du serveur compté dans le premier dont on connaît la durée. */
export function dureesDesMemos(estimation: MemoEstimate): MemoDurations[] {
  let demarrage = estimation.demarrageMs;
  return estimation.memos.map(({ transcriptionMs, miseEnFormeMs }) => {
    if (transcriptionMs === null) {
      return { transcriptionMs, miseEnFormeMs };
    }
    const avecDemarrage = transcriptionMs + demarrage;
    demarrage = 0;
    return { transcriptionMs: avecDemarrage, miseEnFormeMs };
  });
}

/** Durée totale de ces mémos ; null si aucun n'a de durée connue. */
export function dureeTotale(memos: readonly MemoDurations[]): Duration | null {
  const connus = memos.filter((memo) => memo.transcriptionMs !== null);
  if (connus.length === 0) {
    return null;
  }
  return {
    ms: connus.reduce((total, memo) => total + memo.transcriptionMs! + (memo.miseEnFormeMs ?? 0), 0),
    complet: connus.length === memos.length && connus.every((memo) => memo.miseEnFormeMs !== null),
  };
}

/** Ce qui reste du mémo en cours, selon son étape et le temps passé dedans. */
export function restantDuMemo(memo: MemoDurations, etape: MemoStep, ecouleDansLEtapeMs: number): Duration | null {
  if (memo.transcriptionMs === null && etape !== 'mise-en-forme') {
    return null;
  }
  const miseEnForme = memo.miseEnFormeMs ?? 0;
  const complet = memo.miseEnFormeMs !== null;
  if (etape === 'lecture') {
    return { ms: memo.transcriptionMs! + miseEnForme, complet };
  }
  if (etape === 'transcription') {
    return { ms: Math.max(0, memo.transcriptionMs! - ecouleDansLEtapeMs) + miseEnForme, complet };
  }
  return memo.miseEnFormeMs === null ? null : { ms: Math.max(0, memo.miseEnFormeMs - ecouleDansLEtapeMs), complet: true };
}

/** « environ 40 s restantes », « environ 40 s restantes, plus la mise en forme ». */
export function libelleDuRestant(duree: Duration): string {
  return duree.complet ? libelleDeTempsRestant(duree.ms) : `${libelleDeTempsRestant(duree.ms)}, plus la mise en forme`;
}

/** « environ 3 min », « environ 3 min, plus la mise en forme ». */
export function libelleDeLaDuree(duree: Duration): string {
  return duree.complet ? libelleDeDuree(duree.ms) : `${libelleDeDuree(duree.ms)}, plus la mise en forme`;
}
