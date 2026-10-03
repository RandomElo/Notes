import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { IndexStore } from '@notes/core';

/** Index de sync du desktop : `userData/cache/sync-index.json`, jamais dans le vault. */
export class IndexFile implements IndexStore {
  constructor(private readonly fichier: string) {}

  async lire(): Promise<string | null> {
    try {
      return await readFile(this.fichier, 'utf8');
    } catch {
      return null;
    }
  }

  async ecrire(texte: string): Promise<void> {
    await mkdir(dirname(this.fichier), { recursive: true });
    const temporaire = `${this.fichier}.tmp`;
    await writeFile(temporaire, texte, { mode: 0o600 });
    await rename(temporaire, this.fichier);
  }
}
