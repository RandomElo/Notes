import { LocalFsError } from '../fs/local-fs';
import type { LocalFs } from '../fs/local-fs';
import { joindreChemins, verifierCheminRelatif } from '../fs/paths';
import { RemoteFsError } from '../fs/remote-fs';
import type { RemoteFs } from '../fs/remote-fs';

/** Un fichier ou un dossier relevé d'un côté, chemin relatif à la racine du vault. */
export interface ScanEntry {
  estDossier: boolean;
  modifieLe: number;
  taille: number;
}

export type Releve = Map<string, ScanEntry>;

/** Nom du verrou d'une page sur le NAS (voir lock.ts). */
export const nomDuVerrou = '.lock';

/**
 * Corbeille (J10, `trash/trash.ts`) : celle du poste n'est qu'un passage, celle du NAS ne descend
 * jamais sur le poste. Elle passe de l'une à l'autre par `transfererCorbeille`, pas par la sync.
 */
const corbeille = '.trash';

/**
 * Ce que la sync ne transporte jamais : les verrous, qui n'ont de sens que sur
 * le NAS, les fichiers temporaires d'une écriture en cours (« .nom.xxxx.tmp »)
 * et la corbeille.
 */
export function estIgnore(chemin: string): boolean {
  const nom = chemin.slice(chemin.lastIndexOf('/') + 1);
  return nom === nomDuVerrou || /^\..+\.tmp$/.test(nom) || chemin === corbeille;
}

/** Relevé complet du vault local. Les noms que SMB refuserait sont mis de côté : ils ne peuvent pas partir sur le NAS. */
export async function releverLocal(fs: LocalFs): Promise<{ releve: Releve; refuses: string[] }> {
  const releve: Releve = new Map();
  const refuses: string[] = [];
  const parcourir = async (dossier: string): Promise<void> => {
    for (const entree of await listerSiPresent(() => fs.lister(dossier), dossier)) {
      const chemin = joindreChemins(dossier, entree.nom);
      if (verifierCheminRelatif(chemin) !== null) {
        refuses.push(chemin);
        continue;
      }
      if (estIgnore(chemin)) {
        continue;
      }
      releve.set(chemin, { estDossier: entree.estDossier, modifieLe: entree.modifieLe, taille: entree.taille });
      if (entree.estDossier) {
        await parcourir(chemin);
      }
    }
  };
  await parcourir('');
  return { releve, refuses };
}

/** Relevé complet du vault sur le NAS. */
export async function releverDistant(fs: RemoteFs): Promise<Releve> {
  const releve: Releve = new Map();
  const parcourir = async (dossier: string): Promise<void> => {
    for (const entree of await listerSiPresent(() => fs.lister(dossier), dossier)) {
      const chemin = joindreChemins(dossier, entree.nom);
      if (verifierCheminRelatif(chemin) !== null || estIgnore(chemin)) {
        continue;
      }
      releve.set(chemin, { estDossier: entree.estDossier, modifieLe: entree.modifieLe, taille: entree.taille });
      if (entree.estDossier) {
        await parcourir(chemin);
      }
    }
  };
  await parcourir('');
  return releve;
}

/**
 * Un sous-dossier renommé ou supprimé pendant le relevé est simplement sauté :
 * son nouvel emplacement est relevé ailleurs, ou au cycle suivant.
 */
async function listerSiPresent<T>(lister: () => Promise<T[]>, dossier: string): Promise<T[]> {
  try {
    return await lister();
  } catch (erreur) {
    const disparu = (erreur instanceof LocalFsError || erreur instanceof RemoteFsError) && erreur.code === 'introuvable';
    if (disparu && dossier !== '') {
      return [];
    }
    throw erreur;
  }
}
