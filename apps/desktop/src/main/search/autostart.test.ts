import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Autostart, contenuDuLanceur } from './autostart';

describe('contenuDuLanceur', () => {
  it('lance l’AppImage en fond, chemin entre guillemets', () => {
    expect(contenuDuLanceur('/home/utilisateur/Applications/Notes 2.AppImage')).toContain('Exec="/home/utilisateur/Applications/Notes 2.AppImage" --fond\n');
  });

  it('échappe les caractères réservés de la ligne Exec', () => {
    expect(contenuDuLanceur('/tmp/a"b$c`d\\e.AppImage')).toContain('Exec="/tmp/a\\"b\\$c\\`d\\\\e.AppImage" --fond');
  });
});

describe('Autostart', () => {
  it('écrit puis retire le fichier de démarrage', async () => {
    const dossier = await mkdtemp(join(tmpdir(), 'notes-autostart-'));
    const demarrage = new Autostart(dossier, '/opt/Notes.AppImage');
    expect(await demarrage.actif()).toBe(false);
    await demarrage.definir(true);
    expect(await demarrage.actif()).toBe(true);
    expect(await readFile(join(dossier, 'autostart', 'notes.desktop'), 'utf8')).toBe(contenuDuLanceur('/opt/Notes.AppImage'));
    await demarrage.definir(false);
    expect(await demarrage.actif()).toBe(false);
  });

  it('un fichier qui lance une autre AppImage ne compte pas comme actif', async () => {
    const dossier = await mkdtemp(join(tmpdir(), 'notes-autostart-'));
    await new Autostart(dossier, '/ancien/Notes.AppImage').definir(true);
    expect(await new Autostart(dossier, '/opt/Notes.AppImage').actif()).toBe(false);
  });

  it('ne fait rien hors de l’AppImage', async () => {
    const dossier = await mkdtemp(join(tmpdir(), 'notes-autostart-'));
    const demarrage = new Autostart(dossier, undefined);
    await demarrage.definir(true);
    expect(demarrage.disponible()).toBe(false);
    expect(await demarrage.actif()).toBe(false);
  });
});
