import { describe, expect, it } from 'vitest';
import { dureesDesMemos, dureeTotale, libelleDeLaDuree, libelleDuRestant, restantDuMemo } from './memo-timing';

const memo = (chemin: string, transcriptionMs: number | null, miseEnFormeMs: number | null) => ({ chemin, audioMs: transcriptionMs, transcriptionMs, miseEnFormeMs });

describe('temps des mémos', () => {
  it('compte le démarrage du serveur une seule fois, dans le premier mémo connu', () => {
    const durees = dureesDesMemos({ demarrageMs: 5000, memos: [memo('a', null, null), memo('b', 10_000, 20_000), memo('c', 4000, 8000)] });
    expect(durees.map((duree) => duree.transcriptionMs)).toEqual([null, 15_000, 4000]);
  });

  it('additionne la série et dit quand une partie manque', () => {
    expect(dureeTotale([{ transcriptionMs: 15_000, miseEnFormeMs: 20_000 }, { transcriptionMs: 4000, miseEnFormeMs: 8000 }])).toEqual({ ms: 47_000, complet: true });
    expect(dureeTotale([{ transcriptionMs: 15_000, miseEnFormeMs: null }])).toEqual({ ms: 15_000, complet: false });
    expect(dureeTotale([{ transcriptionMs: null, miseEnFormeMs: null }])).toBeNull();
    expect(dureeTotale([])).toBeNull();
  });

  it('suit l’étape en cours', () => {
    const durees = { transcriptionMs: 10_000, miseEnFormeMs: 30_000 };
    expect(restantDuMemo(durees, 'lecture', 500)).toEqual({ ms: 40_000, complet: true });
    expect(restantDuMemo(durees, 'transcription', 4000)).toEqual({ ms: 36_000, complet: true });
    expect(restantDuMemo(durees, 'transcription', 15_000)).toEqual({ ms: 30_000, complet: true });
    expect(restantDuMemo(durees, 'mise-en-forme', 10_000)).toEqual({ ms: 20_000, complet: true });
    expect(restantDuMemo({ transcriptionMs: 10_000, miseEnFormeMs: null }, 'mise-en-forme', 0)).toBeNull();
    expect(restantDuMemo({ transcriptionMs: null, miseEnFormeMs: 3000 }, 'transcription', 0)).toBeNull();
  });

  it('se lit simplement', () => {
    expect(libelleDuRestant({ ms: 40_000, complet: true })).toBe('environ 40 s restantes');
    expect(libelleDuRestant({ ms: 40_000, complet: false })).toBe('environ 40 s restantes, plus la mise en forme');
    expect(libelleDeLaDuree({ ms: 180_000, complet: true })).toBe('environ 3 min');
  });
});
