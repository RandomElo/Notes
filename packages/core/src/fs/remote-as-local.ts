import { LocalFsError } from './local-fs';
import type { LocalEntry, LocalFs } from './local-fs';
import { RemoteFsError } from './remote-fs';
import type { RemoteFs } from './remote-fs';
import { versOctets, versTexte } from './utf8';

/**
 * Le dossier du vault sur le NAS vu comme un `LocalFs`, pour que le téléphone
 * crée une page directement sur le NAS avec les mêmes opérations que le
 * desktop (vault/operations.ts). Un fichier absent devient une
 * `LocalFsError` « introuvable », comme sur un disque ; les autres erreurs du
 * NAS passent telles quelles, pour être montrées comme des erreurs réseau.
 */
export class RemoteAsLocalFs implements LocalFs {
  constructor(private readonly distant: RemoteFs) {}

  infos(chemin: string): Promise<LocalEntry | null> {
    return this.distant.infos(chemin);
  }

  lister(chemin: string): Promise<LocalEntry[]> {
    return traduire(() => this.distant.lister(chemin));
  }

  async lireTexte(chemin: string): Promise<string> {
    return versTexte(await this.lireOctets(chemin));
  }

  ecrireTexte(chemin: string, contenu: string): Promise<void> {
    return this.distant.ecrire(chemin, versOctets(contenu));
  }

  lireOctets(chemin: string): Promise<Uint8Array> {
    return traduire(() => this.distant.lire(chemin));
  }

  ecrireOctets(chemin: string, contenu: Uint8Array): Promise<void> {
    return this.distant.ecrire(chemin, contenu);
  }

  creerDossier(chemin: string): Promise<void> {
    return this.distant.creerDossier(chemin);
  }

  renommer(chemin: string, vers: string): Promise<void> {
    return traduire(() => this.distant.renommer(chemin, vers));
  }

  async copierFichier(chemin: string, vers: string): Promise<void> {
    await this.distant.ecrire(vers, await this.lireOctets(chemin));
  }

  supprimer(chemin: string): Promise<void> {
    return traduire(() => this.distant.supprimer(chemin));
  }
}

async function traduire<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (erreur) {
    if (erreur instanceof RemoteFsError && erreur.code === 'introuvable') {
      throw new LocalFsError('introuvable', erreur.message);
    }
    throw erreur;
  }
}
