import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SettingsStore } from './settings-store';

const nas = { hote: '192.168.1.30', partage: 'Eloi', utilisateur: 'Eloi', dossierVault: 'Notes' };

describe('SettingsStore', () => {
  it('rend le défaut si le fichier manque ou est abîmé', async () => {
    const fichier = join(await mkdtemp(join(tmpdir(), 'notes-reglages-')), 'settings.json');
    const reglages = new SettingsStore(fichier);
    expect(await reglages.lire()).toEqual({ nas: null });
    await writeFile(fichier, 'pas du json');
    expect(await reglages.lire()).toEqual({ nas: null });
  });

  it("écrit puis relit, sans laisser passer de champ inattendu", async () => {
    const fichier = join(await mkdtemp(join(tmpdir(), 'notes-reglages-')), 'a', 'settings.json');
    const reglages = new SettingsStore(fichier);
    await reglages.ecrire({ nas: { ...nas, motDePasse: 'secret' } as typeof nas });
    expect(await reglages.lire()).toEqual({ nas });
    expect(await readFile(fichier, 'utf8')).not.toContain('secret');
  });
});
