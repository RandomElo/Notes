import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcess } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { argumentsDeConversion, convertirEnWav, dureeAudio, lireDureeAffichee } from './ffmpeg';

/** Un faux ffmpeg : écrit « sortie » puis se termine avec « code ». */
function fauxFfmpeg(sortie: Buffer, code: number, erreurs = '') {
  const appels: { binaire: string; args: string[] }[] = [];
  const lancer = (binaire: string, args: string[]): ChildProcess => {
    appels.push({ binaire, args });
    const processus = new EventEmitter() as ChildProcess;
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    Object.assign(processus, { stdout, stderr, kill: () => true });
    setTimeout(() => {
      stderr.end(erreurs);
      stdout.end(sortie);
      stdout.on('end', () => setTimeout(() => processus.emit('close', code), 0));
    }, 0);
    return processus;
  };
  return { lancer, appels };
}

describe('conversion par ffmpeg', () => {
  it('demande un WAV 16 kHz mono sur la sortie, le fichier préfixé par file:', () => {
    const args = argumentsDeConversion('/notes/.notes/memos/-i.amr');
    expect(args).toContain('file:/notes/.notes/memos/-i.amr');
    expect(args.slice(args.indexOf('-ar'), args.indexOf('-ar') + 2)).toEqual(['-ar', '16000']);
    expect(args.at(-1)).toBe('pipe:1');
  });

  it('rend les octets du WAV', async () => {
    const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(100)]);
    const { lancer, appels } = fauxFfmpeg(wav, 0);
    expect(await convertirEnWav('/ressources/ffmpeg', '/m.amr', lancer)).toEqual(new Uint8Array(wav));
    expect(appels[0]?.binaire).toBe('/ressources/ffmpeg');
  });

  it('refuse un fichier sans son, et un fichier illisible', async () => {
    await expect(convertirEnWav('f', '/x', fauxFfmpeg(Buffer.alloc(44), 0).lancer)).rejects.toThrow('ne contient pas d’audio');
    await expect(convertirEnWav('f', '/x', fauxFfmpeg(Buffer.alloc(0), 1, 'moov atom not found').lancer)).rejects.toThrow('ne se lit pas');
  });
});

describe('durée d’un fichier audio', () => {
  it('lit la durée dans la description de l’entrée', () => {
    expect(lireDureeAffichee('Input #0, mov,mp4,m4a\n  Duration: 00:01:23.45, start: 0.000000, bitrate: 32 kb/s')).toBe(83_450);
    expect(lireDureeAffichee('  Duration: 01:00:00.00, bitrate: 32 kb/s')).toBe(3_600_000);
    expect(lireDureeAffichee('  Duration: N/A, bitrate: N/A')).toBeNull();
  });

  it('demande la description à ffmpeg sans rien décoder', async () => {
    const { lancer, appels } = fauxFfmpeg(Buffer.alloc(0), 1, '  Duration: 00:00:11.00, start: 0\nAt least one output file must be specified\n');
    expect(await dureeAudio('/opt/ffmpeg', '/vault/.notes/memos/memo.m4a', lancer)).toBe(11_000);
    expect(appels[0]!.args).toEqual(['-hide_banner', '-nostdin', '-i', 'file:/vault/.notes/memos/memo.m4a']);
  });
});
