import { describe, expect, it, vi } from 'vitest';
import type { spawn } from 'node:child_process';
import { attendreLaFinDeLAncienne, relancerApresLaFin, scriptDeRelance, variableDAttente } from './relaunch';

describe('relancerApresLaFin', () => {
  it('lance la nouvelle AppImage détachée, avec le numéro à attendre et sans l’environnement de l’ancienne', () => {
    const unref = vi.fn();
    const lancer = vi.fn(() => ({ unref }));
    process.env['APPDIR'] = '/tmp/.mount_ancienne';
    relancerApresLaFin('/opt/Notes.AppImage', ['--fond'], lancer as unknown as typeof spawn, () => true);
    const [fichier, argumentsDeLancement, options] = lancer.mock.calls[0] as unknown as [string, string[], { detached: boolean; env: NodeJS.ProcessEnv }];
    expect(fichier).toBe('/bin/bash');
    expect(argumentsDeLancement).toEqual(['-c', scriptDeRelance, '/opt/Notes.AppImage', '--fond']);
    expect(options.detached).toBe(true);
    expect(options.env[variableDAttente]).toBe(String(process.pid));
    expect(options.env['APPDIR']).toBeUndefined();
    expect(unref).toHaveBeenCalled();
    delete process.env['APPDIR'];
  });

  it('sans bash, lance directement la nouvelle AppImage', () => {
    const lancer = vi.fn(() => ({ unref: vi.fn() }));
    relancerApresLaFin('/opt/Notes.AppImage', ['--fond'], lancer as unknown as typeof spawn, () => false);
    expect(lancer.mock.calls[0]?.slice(0, 2)).toEqual(['/opt/Notes.AppImage', ['--fond']]);
  });
});

describe('scriptDeRelance', () => {
  it('ferme les descripteurs hérités, même au-delà de 9, puis lance le programme avec ses arguments', async () => {
    const { execFile } = await import('node:child_process');
    // Un bash extérieur ouvre les descripteurs 5 et 12 sans fermeture automatique, comme le canal de montage d'une AppImage.
    const exterieur = 'exec 5</dev/null 12</dev/null; exec /bin/bash -c "$1" /bin/sh -c "echo \\"\\$1\\"; ls /proc/\\$\\$/fd" sh argument';
    const sortie = await new Promise<string>((resoudre, rejeter) => {
      execFile('/bin/bash', ['-c', exterieur, 'bash', scriptDeRelance], (erreur, stdout) => (erreur ? rejeter(erreur) : resoudre(stdout)));
    });
    const [premiere, ...descripteurs] = sortie.trim().split('\n');
    expect(premiere).toBe('argument');
    expect(descripteurs).not.toContain('5');
    expect(descripteurs).not.toContain('12');
  });

  it('le bash extérieur de l’essai passe bien ses descripteurs à qui ne les ferme pas', async () => {
    const { execFile } = await import('node:child_process');
    const sortie = await new Promise<string>((resoudre, rejeter) => {
      execFile('/bin/bash', ['-c', 'exec 12</dev/null; exec /bin/sh -c "ls /proc/\\$\\$/fd"'], (erreur, stdout) => (erreur ? rejeter(erreur) : resoudre(stdout)));
    });
    expect(sortie.trim().split('\n')).toContain('12');
  });
});

describe('attendreLaFinDeLAncienne', () => {
  it('attend que l’ancienne instance soit finie, puis oublie la variable', async () => {
    let restants = 3;
    const environnement: NodeJS.ProcessEnv = { [variableDAttente]: '1234' };
    await attendreLaFinDeLAncienne(environnement, () => restants-- > 0, 1);
    expect(restants).toBe(-1);
    expect(environnement[variableDAttente]).toBeUndefined();
  });

  it('n’attend rien sans variable', async () => {
    const vivant = vi.fn(() => true);
    await attendreLaFinDeLAncienne({}, vivant, 1);
    expect(vivant).not.toHaveBeenCalled();
  });
});
