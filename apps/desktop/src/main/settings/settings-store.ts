import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { lireReglages } from '@notes/core';
import type { Settings } from '@notes/core';

/** Réglages locaux du poste (userData/settings.json). Aucun secret dedans. */
export class SettingsStore {
  constructor(private readonly fichier: string) {}

  async lire(): Promise<Settings> {
    try {
      return lireReglages(JSON.parse(await readFile(this.fichier, 'utf8')));
    } catch {
      return lireReglages(null);
    }
  }

  async ecrire(reglages: Settings): Promise<void> {
    await mkdir(dirname(this.fichier), { recursive: true });
    const temporaire = `${this.fichier}.tmp`;
    // Repasser par lireReglages garantit qu'aucun champ inattendu n'atteint le disque.
    await writeFile(temporaire, `${JSON.stringify(lireReglages(reglages), null, 2)}\n`, { mode: 0o600 });
    await rename(temporaire, this.fichier);
  }
}
