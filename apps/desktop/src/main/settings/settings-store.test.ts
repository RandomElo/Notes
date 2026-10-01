import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SettingsStore } from './settings-store';

const nas = { hote: '192.0.2.10', partage: 'partage', utilisateur: 'utilisateur', dossierVault: 'Notes' };

describe('SettingsStore', () => {
  it('rend le défaut si le fichier manque ou est abîmé', async () => {
    const fichier = join(await mkdtemp(join(tmpdir(), 'notes-reglages-')), 'settings.json');
    const reglages = new SettingsStore(fichier);
    expect(await reglages.lire()).toEqual({ nas: null, vaultLocal: null });
    await writeFile(fichier, 'pas du json');
    expect(await reglages.lire()).toEqual({ nas: null, vaultLocal: null });
  });

  it("écrit puis relit, sans laisser passer de champ inattendu", async () => {
    const fichier = join(await mkdtemp(join(tmpdir(), 'notes-reglages-')), 'a', 'settings.json');
    const reglages = new SettingsStore(fichier);
    await reglages.ecrire({ nas: { ...nas, motDePasse: 'secret' } as typeof nas, vaultLocal: '/home/eloi/Notes' });
    expect(await reglages.lire()).toEqual({ nas, vaultLocal: '/home/eloi/Notes' });
    expect(await readFile(fichier, 'utf8')).not.toContain('secret');
  });
});
