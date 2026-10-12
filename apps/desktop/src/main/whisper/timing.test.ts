import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { calerTranscription, caracteresProbables, dureeDeTranscription, dureeDuWav, TranscriptionMeasures } from './timing';
import type { TranscriptionMeasure } from './timing';

const mesure = (audioMs: number, transcriptionMs: number, demarrageMs: number | null = null, caracteres = audioMs / 50): TranscriptionMeasure => ({ audioMs, transcriptionMs, demarrageMs, caracteres });

describe('durée d’une transcription', () => {
  it('part de valeurs par défaut selon la carte avant toute mesure', () => {
    const avecCarte = calerTranscription([], true);
    const sansCarte = calerTranscription([], false);
    expect(avecCarte.mesuresConnues).toBe(0);
    expect(dureeDeTranscription(avecCarte, 60_000, false)).toBe(4300);
    expect(dureeDeTranscription(sansCarte, 60_000, false)).toBe(30_300);
    expect(dureeDeTranscription(avecCarte, 60_000, true)).toBe(9300);
    expect(caracteresProbables(avecCarte, 60_000)).toBe(900);
  });

  it('se cale sur la médiane des dernières mesures', () => {
    const calage = calerTranscription([mesure(60_000, 6300, 3000), mesure(30_000, 3300), mesure(120_000, 12_300, 4000), mesure(500, 5000)], true);
    expect(calage.mesuresConnues).toBe(3);
    expect(calage.parMsDAudio).toBeCloseTo(0.1);
    expect(calage.demarrageMs).toBe(3500);
    expect(calage.caracteresParSeconde).toBeCloseTo(20);
    expect(dureeDeTranscription(calage, 90_000, false)).toBe(9300);
  });

  it('ne garde que les dix dernières mesures', () => {
    const anciennes = Array.from({ length: 10 }, () => mesure(60_000, 60_300));
    const recentes = Array.from({ length: 10 }, () => mesure(60_000, 3300));
    expect(calerTranscription([...anciennes, ...recentes], true).parMsDAudio).toBeCloseTo(0.05);
  });

  it('mesure un WAV 16 kHz mono 16 bits', () => {
    expect(dureeDuWav(new Uint8Array(44 + 32_000))).toBe(1000);
    expect(dureeDuWav(new Uint8Array(10))).toBe(0);
  });
});

describe('mesures du poste', () => {
  it('garde les dix dernières et ignore un fichier abîmé', async () => {
    const fichier = join(await mkdtemp(join(tmpdir(), 'notes-transcriptions-')), 'transcriptions.json');
    const mesures = new TranscriptionMeasures(fichier);
    expect(await mesures.lire()).toEqual([]);
    for (let rang = 0; rang < 12; rang++) {
      await mesures.ajouter(mesure(1000 * (rang + 1), 100));
    }
    const lues = await mesures.lire();
    expect(lues).toHaveLength(10);
    expect(lues[0]!.audioMs).toBe(3000);
    expect(JSON.parse(await readFile(fichier, 'utf8'))).toHaveLength(10);
    await writeFile(fichier, '[{"audioMs":"beaucoup"},', 'utf8');
    expect(await mesures.lire()).toEqual([]);
    await writeFile(fichier, JSON.stringify([{ audioMs: -1, transcriptionMs: 1, demarrageMs: null, caracteres: 1 }, mesure(2000, 100)]), 'utf8');
    expect(await mesures.lire()).toEqual([mesure(2000, 100)]);
  });
});
