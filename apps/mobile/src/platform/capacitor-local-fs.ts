import { LocalFsError, dossierParent, joindreChemins, nomDeBase, verifierCheminRelatif } from '@notes/core';
import type { LocalEntry, LocalFs } from '@notes/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import type { FileInfo } from '@capacitor/filesystem';
import { depuisBase64, versBase64 } from './base64';

/**
 * `LocalFs` sur le stockage privé de l'application (README §16) : le cache du
 * vault vit dans `racine`, sous le dossier de données de l'application, que
 * les autres applications ne voient pas. Dans un navigateur (mode
 * démonstration), le même plugin range tout dans IndexedDB.
 */
export class CapacitorLocalFs implements LocalFs {
  constructor(private readonly racine: string) {}

  async infos(chemin: string): Promise<LocalEntry | null> {
    const info = await this.stat(this.complet(chemin, true));
    return info === null ? null : entree(nomDeBase(chemin), info);
  }

  async lister(chemin: string): Promise<LocalEntry[]> {
    const complet = this.complet(chemin, true);
    if (chemin === '' && (await this.stat(complet)) === null) {
      // Premier lancement : le cache n'existe pas encore, il est vide.
      await Filesystem.mkdir({ path: complet, directory: Directory.Data, recursive: true });
      return [];
    }
    try {
      const { files } = await Filesystem.readdir({ path: complet, directory: Directory.Data });
      return files.map((info) => entree(info.name, info));
    } catch (erreur) {
      throw await this.erreur(complet, erreur);
    }
  }

  async lireTexte(chemin: string): Promise<string> {
    return new TextDecoder().decode(await this.lireOctets(chemin));
  }

  async ecrireTexte(chemin: string, contenu: string): Promise<void> {
    await this.ecrireOctets(chemin, new TextEncoder().encode(contenu));
  }

  async lireOctets(chemin: string): Promise<Uint8Array> {
    const complet = this.complet(chemin);
    try {
      const { data } = await Filesystem.readFile({ path: complet, directory: Directory.Data });
      return typeof data === 'string' ? depuisBase64(data) : new Uint8Array(await data.arrayBuffer());
    } catch (erreur) {
      throw await this.erreur(complet, erreur);
    }
  }

  /** Écrit à côté puis renomme : une coupure au milieu ne laisse jamais un fichier à moitié écrit. */
  async ecrireOctets(chemin: string, contenu: Uint8Array): Promise<void> {
    const complet = this.complet(chemin);
    const temporaire = joindreChemins(dossierParent(complet), `.${nomDeBase(complet)}.ecriture.tmp`);
    await Filesystem.writeFile({ path: temporaire, directory: Directory.Data, data: versBase64(contenu) });
    if ((await this.stat(complet)) !== null) {
      await Filesystem.deleteFile({ path: complet, directory: Directory.Data });
    }
    await Filesystem.rename({ from: temporaire, to: complet, directory: Directory.Data, toDirectory: Directory.Data });
  }

  async creerDossier(chemin: string): Promise<void> {
    const complet = this.complet(chemin, true);
    const info = await this.stat(complet);
    if (info?.type === 'directory') {
      return;
    }
    await Filesystem.mkdir({ path: complet, directory: Directory.Data, recursive: true });
  }

  async renommer(chemin: string, vers: string): Promise<void> {
    const [de, a] = [this.complet(chemin), this.complet(vers)];
    if ((await this.stat(a)) !== null) {
      throw new LocalFsError('existe_deja', `Existe déjà : ${vers}`);
    }
    try {
      await Filesystem.rename({ from: de, to: a, directory: Directory.Data, toDirectory: Directory.Data });
    } catch (erreur) {
      throw await this.erreur(de, erreur);
    }
  }

  async copierFichier(chemin: string, vers: string): Promise<void> {
    const [de, a] = [this.complet(chemin), this.complet(vers)];
    if ((await this.stat(a)) !== null) {
      throw new LocalFsError('existe_deja', `Existe déjà : ${vers}`);
    }
    try {
      await Filesystem.copy({ from: de, to: a, directory: Directory.Data, toDirectory: Directory.Data });
    } catch (erreur) {
      throw await this.erreur(de, erreur);
    }
  }

  async supprimer(chemin: string): Promise<void> {
    const complet = this.complet(chemin);
    const info = await this.stat(complet);
    if (info === null) {
      throw new LocalFsError('introuvable', `Introuvable : ${chemin}`);
    }
    if (info.type === 'directory') {
      await Filesystem.rmdir({ path: complet, directory: Directory.Data, recursive: true });
    } else {
      await Filesystem.deleteFile({ path: complet, directory: Directory.Data });
    }
  }

  /** Le chemin dans le dossier de données. Le chemin vide (la racine du cache) n'est permis que là où il a un sens. */
  private complet(chemin: string, racinePermise = false): string {
    if (chemin === '' && racinePermise) {
      return this.racine;
    }
    const refus = verifierCheminRelatif(chemin);
    if (refus !== null) {
      throw new LocalFsError('chemin_invalide', refus);
    }
    return joindreChemins(this.racine, chemin);
  }

  private async stat(complet: string): Promise<FileInfo | null> {
    try {
      return await Filesystem.stat({ path: complet, directory: Directory.Data });
    } catch {
      return null;
    }
  }

  /** Le plugin ne donne qu'un message : un fichier absent se reconnaît en le cherchant. */
  private async erreur(complet: string, erreur: unknown): Promise<LocalFsError> {
    if ((await this.stat(complet)) === null) {
      return new LocalFsError('introuvable', `Introuvable : ${complet.slice(this.racine.length + 1)}`);
    }
    return new LocalFsError('interne', erreur instanceof Error ? erreur.message : String(erreur));
  }
}

function entree(nom: string, info: FileInfo): LocalEntry {
  const estDossier = info.type === 'directory';
  return { nom, estDossier, taille: estDossier ? 0 : info.size, modifieLe: info.mtime };
}

/** Un petit fichier texte de l'application (réglages, index), hors du cache du vault. */
export const fichierDeLApplication = {
  async lire(chemin: string): Promise<string | null> {
    try {
      const { data } = await Filesystem.readFile({ path: chemin, directory: Directory.Data, encoding: Encoding.UTF8 });
      return typeof data === 'string' ? data : await data.text();
    } catch {
      return null;
    }
  },
  async ecrire(chemin: string, texte: string): Promise<void> {
    await Filesystem.writeFile({ path: chemin, directory: Directory.Data, data: texte, encoding: Encoding.UTF8, recursive: true });
  },
};
