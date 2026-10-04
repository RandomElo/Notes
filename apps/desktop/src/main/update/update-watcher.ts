import { watch } from 'node:fs';
import type { FSWatcher } from 'node:fs';
import { stat } from 'node:fs/promises';
import { basename, dirname } from 'node:path';

/** Le fichier est relu ce délai après le dernier changement vu : une copie en cours n'est pas prise pour une installation. */
const delaiMs = 1000;

/**
 * Surveille le fichier de l'application (l'AppImage) et prévient une fois
 * quand il est remplacé par une autre version (`npm run installer`). Le
 * remplacement se voit au changement d'inode : l'installation renomme le
 * nouveau fichier par-dessus l'ancien, que l'application en cours garde ouvert.
 */
export class UpdateWatcher {
  private surveillance: FSWatcher | null = null;
  private minuteur: ReturnType<typeof setTimeout> | null = null;
  private inodeDeDepart: number | null = null;
  private prevenu = false;

  constructor(
    private readonly fichier: string,
    private readonly surRemplacement: () => void,
  ) {}

  async demarrer(): Promise<void> {
    this.inodeDeDepart = (await stat(this.fichier)).ino;
    // Le dossier, pas le fichier : le renommage remplace le fichier surveillé.
    this.surveillance = watch(dirname(this.fichier), (_evenement, nom) => {
      if (nom === null || nom === basename(this.fichier)) {
        this.plusTard();
      }
    });
  }

  arreter(): void {
    this.surveillance?.close();
    this.surveillance = null;
    if (this.minuteur !== null) {
      clearTimeout(this.minuteur);
      this.minuteur = null;
    }
  }

  private plusTard(): void {
    if (this.minuteur !== null) {
      clearTimeout(this.minuteur);
    }
    this.minuteur = setTimeout(() => {
      this.minuteur = null;
      void this.verifier();
    }, delaiMs);
  }

  private async verifier(): Promise<void> {
    if (this.prevenu) {
      return;
    }
    const infos = await stat(this.fichier).catch(() => null);
    if (infos !== null && infos.ino !== this.inodeDeDepart && (infos.mode & 0o111) !== 0) {
      this.prevenu = true;
      this.surRemplacement();
    }
  }
}
