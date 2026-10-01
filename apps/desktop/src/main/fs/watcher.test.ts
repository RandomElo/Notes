import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { surveillerVault } from './watcher';

const attendre = (ms: number) => new Promise((resoudre) => setTimeout(resoudre, ms));

describe('surveillerVault', () => {
  it('regroupe une rafale de modifications en un seul signal, sous-dossiers compris', async () => {
    const racine = await mkdtemp(join(tmpdir(), 'notes-surveillance-'));
    await mkdir(join(racine, 'Projets'));
    const signal = vi.fn();
    const arreter = surveillerVault(racine, signal, 40);
    await attendre(50);

    await writeFile(join(racine, 'Projets', 'page.md'), 'a');
    await writeFile(join(racine, 'Projets', 'page.md'), 'b');
    await writeFile(join(racine, 'autre.md'), 'c');
    await attendre(200);
    expect(signal).toHaveBeenCalledTimes(1);

    arreter();
    await writeFile(join(racine, 'apres.md'), 'd');
    await attendre(120);
    expect(signal).toHaveBeenCalledTimes(1);
  });

  it('ne plante pas sur un dossier absent', () => {
    expect(() => surveillerVault('/dossier/qui/n/existe/pas', () => undefined)()).not.toThrow();
  });
});
