import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { ajouterImage, dossierAssets, listerImagesAConvertir, listerImagesOrphelines, natureDImage, remplacerParWebp, tailleMaxAvantConversion, tailleMaxDImage } from '@notes/core';
import type { ImageToConvert } from '@notes/core';
import type { BackgroundRemovalResult, ImageReadResult, ImagesAddResult, ImagesReceivedResult } from '../../shared/ipc-contract';
import type { BackgroundRemoval } from '../images/background-removal';
import { coteDuModele } from '../images/background-removal-model';
import type { DownloadResult } from '../images/download';
import type { VaultService } from '../vault/vault-service';
import { champs, estChemin, requeteInvalide, versErreur } from './vault';

export interface ImagesHandlersDependencies {
  vault: VaultService;
  /** File des opérations sur le vault (ipc/vault.ts) : deux images ajoutées ensemble ne prennent pas le même nom. */
  enSerie: <T>(tache: () => Promise<T>) => Promise<T>;
  /** Sélecteur de fichiers du système, filtré sur les images. Liste vide si l'utilisateur annule. */
  choisirFichiers: () => Promise<string[]>;
  /** Télécharge une image d'Internet (images/download.ts), hors de la file : le réseau ne bloque pas le vault. */
  telecharger: (adresse: string) => Promise<DownloadResult>;
  /** Détourage des icônes (images/background-removal.ts), hors de la file : il ne touche pas au vault. */
  detourage: Pick<BackgroundRemoval, 'masque'>;
}

/** Un nom de fichier seul, sans dossier ni fichier caché : ce qu'un dossier `assets/` peut contenir. */
const estNomDeFichier = (nom: unknown): nom is string =>
  typeof nom === 'string' && nom.length > 0 && nom.length <= 255 && !/[\\/]/.test(nom) && !nom.startsWith('.');

/**
 * Handlers des canaux « images: ». Les entrées viennent du renderer : rien n'est supposé valide.
 * Une image reçue (choisie, téléchargée) est rendue au renderer, qui la convertit en WebP avant de l'ajouter.
 */
export function creerHandlersImages({ vault, enSerie, choisirFichiers, telecharger, detourage }: ImagesHandlersDependencies) {
  const echec = (erreur: unknown): ImagesAddResult => ({ ok: false, erreur: versErreur(erreur) });

  return {
    choisir: async (): Promise<ImagesReceivedResult> => {
      // Ces fichiers viennent du sélecteur du système : c'est l'utilisateur qui les a désignés.
      const choisis = await choisirFichiers();
      const fichiers: { nom: string | null; octets: Uint8Array }[] = [];
      for (const fichier of choisis) {
        if ((await stat(fichier)).size <= tailleMaxAvantConversion) {
          fichiers.push({ nom: basename(fichier), octets: new Uint8Array(await readFile(fichier)) });
        }
      }
      return { ok: true, fichiers };
    },

    ajouter: (demande: unknown): Promise<ImagesAddResult> => {
      const { chemin, nom, octets } = champs(demande);
      const nomValide = nom === null || (typeof nom === 'string' && nom.length <= 255);
      if (!estChemin(chemin) || !nomValide || !(octets instanceof Uint8Array) || octets.length > tailleMaxDImage) {
        return Promise.resolve(requeteInvalide());
      }
      return enSerie(async () => {
        try {
          return { ok: true, adresses: [await ajouterImage(vault.contexte(), chemin, nom as string | null, octets)] };
        } catch (erreur) {
          return echec(erreur);
        }
      });
    },

    telecharger: async (demande: unknown): Promise<ImagesReceivedResult> => {
      const { adresse } = champs(demande);
      if (typeof adresse !== 'string' || adresse.length > 4096) {
        return requeteInvalide();
      }
      const recu = await telecharger(adresse);
      return recu.ok ? { ok: true, fichiers: [{ nom: recu.nom, octets: recu.octets }] } : { ok: false, erreur: { code: 'interne', message: recu.message } };
    },

    aConvertir: (): Promise<ImageToConvert[]> =>
      enSerie(async () => {
        try {
          return await listerImagesAConvertir(vault.contexte().fs);
        } catch {
          return [];
        }
      }),

    lire: (demande: unknown): Promise<ImageReadResult> => {
      const { page, nom } = champs(demande);
      if (!estChemin(page) || !estNomDeFichier(nom)) {
        return Promise.resolve(requeteInvalide());
      }
      return enSerie(async () => {
        try {
          const octets = await vault.contexte().fs.lireOctets(`${page}/${dossierAssets}/${nom}`);
          // Seulement une image : ce canal ne lit rien d'autre du dossier des notes.
          return natureDImage(octets) === null ? requeteInvalide() : { ok: true, octets };
        } catch (erreur) {
          return { ok: false, erreur: versErreur(erreur) };
        }
      });
    },

    convertir: (demande: unknown): Promise<ImagesAddResult> => {
      const { page, ancien, octets } = champs(demande);
      if (!estChemin(page) || !estNomDeFichier(ancien) || !(octets instanceof Uint8Array) || octets.length > tailleMaxDImage) {
        return Promise.resolve(requeteInvalide());
      }
      return enSerie(async () => {
        try {
          return { ok: true, adresses: [await remplacerParWebp(vault.contexte(), page, ancien, octets)] };
        } catch (erreur) {
          return echec(erreur);
        }
      });
    },

    orphelines: (): Promise<string[]> =>
      enSerie(async () => {
        try {
          return await listerImagesOrphelines(vault.contexte().fs);
        } catch {
          return [];
        }
      }),

    /**
     * Image collée depuis une autre page : le fichier « source » (dans un dossier `assets/`) est
     * copié dans les `assets/` de « page », sans rien remplacer. Rend l'adresse à écrire dans la page.
     */
    copier: (demande: unknown): Promise<ImagesAddResult> => {
      const { source, page } = champs(demande);
      const morceaux = typeof source === 'string' ? source.split('/') : [];
      const nom = morceaux.at(-1);
      if (!estChemin(source) || !estChemin(page) || morceaux.at(-2) !== dossierAssets || !estNomDeFichier(nom)) {
        return Promise.resolve(requeteInvalide());
      }
      return enSerie(async () => {
        try {
          const octets = await vault.contexte().fs.lireOctets(source);
          return natureDImage(octets) === null ? requeteInvalide() : { ok: true, adresses: [await ajouterImage(vault.contexte(), page, nom, octets)] };
        } catch (erreur) {
          return echec(erreur);
        }
      });
    },

    /** Masque du sujet d'un carré de 320 × 320 pixels RGBA, préparé par le renderer à partir de l'icône recadrée. */
    retirerLeFond: (demande: unknown): Promise<BackgroundRemovalResult> => {
      const { pixels, cote } = champs(demande);
      if (cote !== coteDuModele || !(pixels instanceof Uint8Array) || pixels.length !== coteDuModele * coteDuModele * 4) {
        return Promise.resolve({ ok: false, message: 'Demande invalide.' });
      }
      return detourage.masque(pixels, coteDuModele);
    },
  };
}
