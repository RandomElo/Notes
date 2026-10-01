import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { PasswordState } from '../../shared/ipc-contract';

/** Chiffrement fourni par la plateforme (safeStorage d'Electron en production). */
export interface SecretCipher {
  /** Vrai seulement si un trousseau système chiffre réellement les données. */
  disponible(): boolean;
  chiffrer(texte: string): Buffer;
  dechiffrer(donnees: Buffer): string;
}

interface SecretFile {
  version: 1;
  secrets: Record<string, string>;
}

/**
 * Coffre à secrets. Un secret n'est écrit sur le disque que chiffré par le
 * trousseau du système. Sans trousseau, il reste en mémoire jusqu'à la
 * fermeture de l'application et sera redemandé au lancement suivant : il
 * n'existe aucun repli vers un stockage en clair.
 */
export class SecretStore {
  private readonly enMemoire = new Map<string, string>();

  constructor(
    private readonly fichier: string,
    private readonly chiffre: SecretCipher,
  ) {}

  stockageChiffre(): boolean {
    return this.chiffre.disponible();
  }

  async lire(cle: string): Promise<string | null> {
    const enMemoire = this.enMemoire.get(cle);
    if (enMemoire !== undefined) {
      return enMemoire;
    }
    if (!this.chiffre.disponible()) {
      return null;
    }
    const chiffre = (await this.lireFichier()).secrets[cle];
    if (chiffre === undefined) {
      return null;
    }
    try {
      return this.chiffre.dechiffrer(Buffer.from(chiffre, 'base64'));
    } catch {
      // Trousseau changé ou fichier abîmé : le secret est perdu, il sera redemandé.
      return null;
    }
  }

  async etat(cle: string): Promise<PasswordState> {
    if (this.enMemoire.has(cle)) {
      return 'session';
    }
    return (await this.lire(cle)) === null ? 'absent' : 'enregistre';
  }

  async enregistrer(cle: string, valeur: string): Promise<PasswordState> {
    if (!this.chiffre.disponible()) {
      this.enMemoire.set(cle, valeur);
      return 'session';
    }
    const contenu = await this.lireFichier();
    contenu.secrets[cle] = this.chiffre.chiffrer(valeur).toString('base64');
    await this.ecrireFichier(contenu);
    this.enMemoire.delete(cle);
    return 'enregistre';
  }

  async oublier(cle: string): Promise<void> {
    this.enMemoire.delete(cle);
    const contenu = await this.lireFichier();
    if (cle in contenu.secrets) {
      delete contenu.secrets[cle];
      await this.ecrireFichier(contenu);
    }
  }

  private async lireFichier(): Promise<SecretFile> {
    try {
      const brut: unknown = JSON.parse(await readFile(this.fichier, 'utf8'));
      if (typeof brut === 'object' && brut !== null && 'secrets' in brut) {
        const secrets = (brut as { secrets: unknown }).secrets;
        if (typeof secrets === 'object' && secrets !== null) {
          const propres: Record<string, string> = {};
          for (const [cle, valeur] of Object.entries(secrets)) {
            if (typeof valeur === 'string') {
              propres[cle] = valeur;
            }
          }
          return { version: 1, secrets: propres };
        }
      }
    } catch {
      // Fichier absent ou illisible : on repart d'un coffre vide.
    }
    return { version: 1, secrets: {} };
  }

  private async ecrireFichier(contenu: SecretFile): Promise<void> {
    await mkdir(dirname(this.fichier), { recursive: true });
    const temporaire = `${this.fichier}.tmp`;
    await writeFile(temporaire, JSON.stringify(contenu), { mode: 0o600 });
    await chmod(temporaire, 0o600);
    await rename(temporaire, this.fichier);
  }
}
