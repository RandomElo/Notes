import { describe, expect, it } from 'vitest';
import { encoderWav, melangerVoies } from './audio-convert';

describe('conversion des mémos pour whisper', () => {
  it('écrit un WAV PCM 16 bits mono lisible', () => {
    const wav = encoderWav(new Float32Array([0, 1, -1, 0.5, 2]), 16_000);
    const vue = new DataView(wav.buffer);
    const texte = (debut: number) => String.fromCharCode(...wav.subarray(debut, debut + 4));
    expect([texte(0), texte(8), texte(12), texte(36)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data']);
    expect(vue.getUint32(4, true)).toBe(wav.length - 8);
    expect(vue.getUint16(22, true)).toBe(1);
    expect(vue.getUint32(24, true)).toBe(16_000);
    expect(vue.getUint32(40, true)).toBe(10);
    expect([0, 1, 2, 3, 4].map((i) => vue.getInt16(44 + i * 2, true))).toEqual([0, 32767, -32768, 16383, 32767]);
  });

  it('mélange les voies en mono', () => {
    expect([...melangerVoies([new Float32Array([1, 0, 0.5]), new Float32Array([0, 0, 0.5])])]).toEqual([0.5, 0, 0.5]);
    const seule = new Float32Array([0.25]);
    expect(melangerVoies([seule])).toBe(seule);
  });
});
