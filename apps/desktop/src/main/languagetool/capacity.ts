import { statfs } from 'node:fs/promises';
import { availableParallelism, totalmem } from 'node:os';
import { dirname } from 'node:path';

/**
 * LanguageTool ne s'installe que sur un poste qui le fait tourner sans ralentir
 * la frappe (docs/spec/correction.md) : il garde environ 900 Mo de mémoire pour
 * toute la session, vérifie chaque bloc modifié, et prend 4 Go sur le disque,
 * plus 2,1 Go de téléchargements pendant l'installation.
 */
export const memoireMinimale = 16 * 1024 ** 3;
export const processeursMinimaux = 8;
export const placeMinimale = 7 * 1024 ** 3;

export interface MachineCapacity {
  /** Mémoire vive totale, en octets. */
  memoire: number;
  /** Cœurs logiques du processeur. */
  processeurs: number;
  /** Place libre là où LanguageTool s'installe, en octets ; null si on ne sait pas la lire. */
  libre: number | null;
}

const go = (octets: number): string => `${Math.round(octets / 1024 ** 3)} Go`;

/** Pourquoi LanguageTool ne peut pas s'installer ici, ou null s'il le peut. */
export function raisonDeRefus({ memoire, processeurs, libre }: MachineCapacity): string | null {
  if (memoire < memoireMinimale) {
    return `Ce poste a ${go(memoire)} de mémoire vive : il en faut au moins ${go(memoireMinimale)} pour que la correction orthographique ne ralentisse pas l'écriture.`;
  }
  if (processeurs < processeursMinimaux) {
    return `Ce processeur a ${processeurs} cœurs : il en faut au moins ${processeursMinimaux} pour que la correction orthographique ne ralentisse pas l'écriture.`;
  }
  if (libre !== null && libre < placeMinimale) {
    return `Il reste ${go(libre)} libres sur le disque : il en faut au moins ${go(placeMinimale)} pour la correction orthographique (4 Go installée, plus les téléchargements).`;
  }
  return null;
}

/** Mémoire du poste et place libre sur le disque du dossier (ou de son premier parent qui existe). */
export async function lireCapacite(dossier: string): Promise<MachineCapacity> {
  let chemin = dossier;
  for (;;) {
    try {
      const disque = await statfs(chemin);
      return { memoire: totalmem(), processeurs: availableParallelism(), libre: disque.bavail * disque.bsize };
    } catch {
      const parent = dirname(chemin);
      if (parent === chemin) {
        return { memoire: totalmem(), processeurs: availableParallelism(), libre: null };
      }
      chemin = parent;
    }
  }
}
