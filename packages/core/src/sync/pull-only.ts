import { LocalFsError } from '../fs/local-fs';
import type { LocalFs } from '../fs/local-fs';
import { dossierParent, estDansDossier, nomDeBase, verifierCheminRelatif } from '../fs/paths';
import type { RemoteFs } from '../fs/remote-fs';
import { fichierPage } from '../page/types';
import { fichierOrdre } from '../vault/order';
import { estSauvegardeDeConflit } from './conflict';
import type { FileStamp, IndexStore } from './index-store';
import { releverDistant, releverLocal } from './scan';
import type { Releve } from './scan';

/**
 * Sync descendante du téléphone (docs/spec/sync.md) : le cache local est une copie du
 * NAS, jamais modifiée sur place. Le texte des pages, l'ordre et le thème sont
 * copiés à chaque cycle, de quoi tout lire hors ligne ; les images et autres
 * fichiers ne descendent qu'à la demande, quand une page les affiche.
 */

/** Fichier du thème, seul fichier de `.notes/` utile à la lecture. */
export const fichierDuTheme = '.notes/theme.toml';

/** Pour chaque fichier du cache, sa date et sa taille sur le NAS au moment où il a été copié. */
interface PullIndex {
  version: 1;
  cle: string;
  fichiers: Record<string, FileStamp>;
}

export interface PullContext {
  /** Le cache, dans le stockage privé de l'application. */
  local: LocalFs;
  /** Le dossier du vault sur le NAS, vu comme une racine (voir fs/remote-subdir.ts). */
  distant: RemoteFs;
  index: IndexStore;
  /** Identifie le NAS, le partage et le dossier : un autre trio repart d'un cache vide. */
  cle: string;
}

export interface PullReport {
  /** Fichiers copiés depuis le NAS. */
  copies: string[];
  /** Fichiers et dossiers retirés du cache : disparus du NAS, ou changés pour ceux copiés à la demande. */
  retires: string[];
  /** Le NAS ne montrait aucun fichier alors que le cache en a : rien n'a été retiré (mauvais dossier, partage vide). */
  distantVide: boolean;
}

/** Ce qui est copié à chaque cycle : de quoi afficher l'arborescence et lire toutes les pages. */
export function estCopieDOffice(chemin: string): boolean {
  if (chemin.split('/').includes('assets')) {
    return false;
  }
  if (chemin === fichierDuTheme) {
    return true;
  }
  if (chemin.startsWith('.notes/') || estSauvegardeDeConflit(chemin)) {
    return false;
  }
  const nom = nomDeBase(chemin);
  return nom === fichierPage || nom === fichierOrdre || nom.toLowerCase().endsWith('.md');
}

/**
 * Le cache d'un téléphone. Un cycle et une lecture à la demande ne se
 * croisent jamais : les deux passent par la même file, et l'index est
 * gardé en mémoire entre deux.
 */
export class PullCache {
  private file: Promise<unknown> = Promise.resolve();
  private index: PullIndex | null = null;

  constructor(private readonly contexte: PullContext) {}

  /** Un cycle : met le cache à jour depuis le NAS. `progression` reçoit le nombre de fichiers copiés sur le nombre à copier. */
  tirer(progression?: (faits: number, total: number) => void): Promise<PullReport> {
    return this.enFile(() => this.cycle(progression));
  }

  /**
   * Un fichier du vault, depuis le cache s'il y est, sinon depuis le NAS (il
   * reste alors dans le cache). Échoue avec l'erreur du NAS si le fichier
   * n'est pas dans le cache et que le NAS ne répond pas.
   */
  lire(chemin: string): Promise<Uint8Array> {
    return this.enFile(async () => {
      const refus = verifierCheminRelatif(chemin);
      if (refus !== null) {
        throw new LocalFsError('chemin_invalide', refus);
      }
      const index = await this.chargerIndex();
      const { local, distant } = this.contexte;
      if (index.fichiers[chemin] !== undefined && (await local.infos(chemin)) !== null) {
        return local.lireOctets(chemin);
      }
      const infos = await distant.infos(chemin);
      if (infos === null || infos.estDossier) {
        throw new LocalFsError('introuvable', `Fichier introuvable : ${chemin}`);
      }
      const contenu = await distant.lire(chemin);
      await creerParent(local, chemin);
      await local.ecrireOctets(chemin, contenu);
      index.fichiers[chemin] = { modifieLe: infos.modifieLe, taille: infos.taille };
      await this.enregistrerIndex(index);
      return contenu;
    });
  }

  /**
   * Un fichier que le téléphone vient d'écrire sur le NAS, ou d'y relire :
   * il entre dans le cache avec la date et la taille qu'il a sur le NAS, et
   * le cycle suivant ne le recopie pas.
   */
  noterCopie(chemin: string, contenu: Uint8Array): Promise<void> {
    return this.enFile(async () => {
      const refus = verifierCheminRelatif(chemin);
      if (refus !== null) {
        throw new LocalFsError('chemin_invalide', refus);
      }
      const index = await this.chargerIndex();
      const { local, distant } = this.contexte;
      await creerParent(local, chemin);
      await local.ecrireOctets(chemin, contenu);
      const infos = await distant.infos(chemin);
      if (infos !== null && !infos.estDossier && infos.taille === contenu.length) {
        index.fichiers[chemin] = { modifieLe: infos.modifieLe, taille: infos.taille };
      } else {
        // Déjà changé sur le NAS : le cycle suivant le recopiera.
        delete index.fichiers[chemin];
      }
      await this.enregistrerIndex(index);
    });
  }

  /**
   * Date de la dernière modification de chaque page sur le NAS (PC ou
   * téléphone), par dossier de page, telle que le cache l'a relevée : sert
   * aux pages récentes de l'accueil, sans relire les fichiers.
   */
  datesDesPages(): Promise<Map<string, number>> {
    return this.enFile(async () => {
      const dates = new Map<string, number>();
      for (const [chemin, tampon] of Object.entries((await this.chargerIndex()).fichiers)) {
        if (nomDeBase(chemin) === fichierPage) {
          dates.set(dossierParent(chemin), tampon.modifieLe);
        }
      }
      return dates;
    });
  }

  private enFile<T>(tache: () => Promise<T>): Promise<T> {
    const suite = this.file.then(tache, tache);
    this.file = suite.catch(() => undefined);
    return suite;
  }

  private async cycle(progression?: (faits: number, total: number) => void): Promise<PullReport> {
    const { local, distant } = this.contexte;
    const index = await this.chargerIndex();
    const releveDistant = await releverDistant(distant);
    const { releve: releveLocal } = await releverLocal(local);
    const rapport: PullReport = { copies: [], retires: [], distantVide: false };

    const fichiersDistants = [...releveDistant].filter(([, entree]) => !entree.estDossier).length;
    if (fichiersDistants === 0 && Object.keys(index.fichiers).length > 0) {
      rapport.distantVide = true;
      return rapport;
    }

    try {
      // Ce qui n'est plus sur le NAS, ou plus à jour pour un fichier copié à la demande.
      for (const [chemin, entree] of [...releveLocal].sort(([a], [b]) => (a < b ? -1 : 1))) {
        if (rapport.retires.some((retire) => estDansDossier(chemin, retire))) {
          continue;
        }
        const enFace = releveDistant.get(chemin);
        const aRetirer = entree.estDossier
          ? enFace === undefined || !enFace.estDossier
          : enFace === undefined || enFace.estDossier || (!estCopieDOffice(chemin) && !memeTampon(index.fichiers[chemin], enFace));
        if (aRetirer) {
          await local.supprimer(chemin);
          rapport.retires.push(chemin);
          for (const connu of Object.keys(index.fichiers).filter((f) => estDansDossier(f, chemin))) {
            delete index.fichiers[connu];
          }
        }
      }

      for (const [chemin, entree] of releveDistant) {
        if (entree.estDossier && !chemin.split('/').includes('assets')) {
          await local.creerDossier(chemin);
        }
      }

      const aCopier = aCopierDOffice(releveDistant, index, releveLocal, rapport.retires);
      progression?.(0, aCopier.length);
      for (const chemin of aCopier) {
        const avant = releveDistant.get(chemin);
        const contenu = await distant.lire(chemin);
        await creerParent(local, chemin);
        await local.ecrireOctets(chemin, contenu);
        if (avant !== undefined) {
          index.fichiers[chemin] = { modifieLe: avant.modifieLe, taille: avant.taille };
        }
        rapport.copies.push(chemin);
        progression?.(rapport.copies.length, aCopier.length);
      }
    } finally {
      // Ce qui est fait reste fait : une coupure au milieu reprend au cycle suivant.
      await this.enregistrerIndex(index);
    }
    return rapport;
  }

  private async chargerIndex(): Promise<PullIndex> {
    if (this.index !== null) {
      return this.index;
    }
    this.index = lireIndex(await this.contexte.index.lire().catch(() => null), this.contexte.cle);
    return this.index;
  }

  private async enregistrerIndex(index: PullIndex): Promise<void> {
    await this.contexte.index.ecrire(JSON.stringify(index));
  }
}

/** Fichiers copiés d'office absents du cache, ou changés sur le NAS depuis leur copie. */
function aCopierDOffice(distant: Releve, index: PullIndex, local: Releve, retires: readonly string[]): string[] {
  const chemins: string[] = [];
  for (const [chemin, entree] of distant) {
    if (entree.estDossier || !estCopieDOffice(chemin)) {
      continue;
    }
    const present = local.has(chemin) && !retires.some((retire) => estDansDossier(chemin, retire));
    if (!present || !memeTampon(index.fichiers[chemin], entree)) {
      chemins.push(chemin);
    }
  }
  return chemins.sort();
}

async function creerParent(local: LocalFs, chemin: string): Promise<void> {
  const parent = dossierParent(chemin);
  if (parent !== '') {
    await local.creerDossier(parent);
  }
}

function memeTampon(connu: FileStamp | undefined, actuel: FileStamp): boolean {
  return connu !== undefined && connu.modifieLe === actuel.modifieLe && connu.taille === actuel.taille;
}

/** Index enregistré, ou index vide s'il est illisible ou d'un autre NAS : tout est alors recopié. */
function lireIndex(texte: string | null, cle: string): PullIndex {
  const vide: PullIndex = { version: 1, cle, fichiers: {} };
  if (texte === null) {
    return vide;
  }
  let brut: unknown;
  try {
    brut = JSON.parse(texte);
  } catch {
    return vide;
  }
  if (typeof brut !== 'object' || brut === null) {
    return vide;
  }
  const objet = brut as Record<string, unknown>;
  if (objet['version'] !== 1 || objet['cle'] !== cle || typeof objet['fichiers'] !== 'object' || objet['fichiers'] === null) {
    return vide;
  }
  const fichiers: Record<string, FileStamp> = {};
  for (const [chemin, tampon] of Object.entries(objet['fichiers'] as Record<string, unknown>)) {
    if (typeof tampon === 'object' && tampon !== null) {
      const { modifieLe, taille } = tampon as Record<string, unknown>;
      if (typeof modifieLe === 'number' && typeof taille === 'number') {
        fichiers[chemin] = { modifieLe, taille };
      }
    }
  }
  return { version: 1, cle, fichiers };
}
