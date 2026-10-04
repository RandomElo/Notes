import { chmod, mkdtemp, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { UpdateWatcher } from './update-watcher';

async function installer(dossier: string, contenu: string): Promise<void> {
  const temporaire = join(dossier, '.Notes.AppImage.nouveau');
  await writeFile(temporaire, contenu);
  await chmod(temporaire, 0o755);
  await rename(temporaire, join(dossier, 'Notes.AppImage'));
}

describe('UpdateWatcher', () => {
  it('prévient une fois quand une autre version remplace le fichier', async () => {
    const dossier = await mkdtemp(join(tmpdir(), 'notes-maj-'));
    await installer(dossier, 'version 1');
    const surRemplacement = vi.fn();
    const surveillance = new UpdateWatcher(join(dossier, 'Notes.AppImage'), surRemplacement);
    await surveillance.demarrer();

    await installer(dossier, 'version 2');
    await vi.waitFor(() => expect(surRemplacement).toHaveBeenCalledTimes(1), { timeout: 4000 });
    await installer(dossier, 'version 3');
    await new Promise((resoudre) => setTimeout(resoudre, 1500));
    expect(surRemplacement).toHaveBeenCalledTimes(1);
    surveillance.arreter();
  });

  it('ne réagit pas aux autres fichiers du dossier', async () => {
    const dossier = await mkdtemp(join(tmpdir(), 'notes-maj-'));
    await installer(dossier, 'version 1');
    const surRemplacement = vi.fn();
    const surveillance = new UpdateWatcher(join(dossier, 'Notes.AppImage'), surRemplacement);
    await surveillance.demarrer();
    await writeFile(join(dossier, 'autre.txt'), 'rien');
    await new Promise((resoudre) => setTimeout(resoudre, 1500));
    expect(surRemplacement).not.toHaveBeenCalled();
    surveillance.arreter();
  });
});
