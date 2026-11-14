import type { UnusedFile } from '@notes/core';

export type FileFilter = 'tous' | 'image' | 'pdf';
export type FileSort = 'taille' | 'nom' | 'date';

/** Taille lisible : « 812 o », « 34 Ko », « 2,4 Mo ». */
export function libelleDeTaille(octets: number): string {
  if (octets < 1024) {
    return `${octets} o`;
  }
  if (octets < 1024 * 1024) {
    return `${Math.round(octets / 1024)} Ko`;
  }
  return `${(octets / 1024 / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;
}

/** Nom du fichier, sans son dossier. */
export function nomDuFichier(chemin: string): string {
  return chemin.split('/').at(-1) ?? chemin;
}

/** Page du fichier, comme dans le fil d'Ariane : « Projets / Refonte ». Vide pour la racine. */
export function pageDuFichier(chemin: string): string {
  return chemin.split('/').slice(0, -2).join(' / ');
}

/** Les fichiers à montrer dans la fenêtre de tri : filtrés par nature, puis triés (les plus gros, les plus anciens d'abord). */
export function fichiersMontres(fichiers: readonly UnusedFile[], filtre: FileFilter, tri: FileSort): UnusedFile[] {
  const gardes = fichiers.filter((fichier) => filtre === 'tous' || fichier.nature === filtre);
  const comparer: Record<FileSort, (a: UnusedFile, b: UnusedFile) => number> = {
    taille: (a, b) => b.taille - a.taille,
    nom: (a, b) => nomDuFichier(a.chemin).localeCompare(nomDuFichier(b.chemin), 'fr', { sensitivity: 'base' }),
    date: (a, b) => a.modifieLe - b.modifieLe,
  };
  return [...gardes].sort((a, b) => comparer[tri](a, b) || a.chemin.localeCompare(b.chemin));
}

/** Nombre et poids d'une liste de fichiers : « 3 fichiers, 2,4 Mo ». */
export function resume(fichiers: readonly UnusedFile[]): string {
  const total = fichiers.reduce((somme, fichier) => somme + fichier.taille, 0);
  return `${fichiers.length === 1 ? 'un fichier' : `${fichiers.length} fichiers`}, ${libelleDeTaille(total)}`;
}
