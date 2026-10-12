import type { TreeNode } from '@notes/core';

/** Dossier de l'archive qui reçoit les images et les feuilles de style. */
export const dossierDesRessources = 'assets';
export const dossierDesImages = `${dossierDesRessources}/images`;
export const feuilleDeLArchive = `${dossierDesRessources}/html/style.css`;

/** Une page dans l'archive ZIP d'un export. */
export interface ArchivePage {
  noeud: TreeNode;
  /** Fichier HTML de la page : `Projets.html`, `Projets/Refonte.html`. */
  fichier: string;
  /** Dossier de ses sous-pages, à côté de son fichier : `Projets`, `Projets/Refonte`. */
  dossierDesEnfants: string;
  enfants: ArchivePage[];
}

/** Nom d'un élément de l'arborescence dans l'archive : son nom de dossier, ou celui de la note `.md` sans l'extension. */
function nomDeLElement(noeud: TreeNode): string {
  const dernier = noeud.chemin.split('/').pop() ?? noeud.titre;
  return noeud.genre === 'fichier' ? dernier.replace(/\.md$/i, '') : dernier;
}

const joindre = (dossier: string, nom: string): string => (dossier === '' ? nom : `${dossier}/${nom}`);

/**
 * Plan de l'archive d'une page et de ses sous-pages (docs/spec/export.md, choix d'Eloi) :
 * à la racine, `assets/` (images, feuille de style) et le fichier de la page ;
 * à côté de chaque fichier, un dossier à son nom avec ses sous-pages, et ainsi
 * de suite. Deux éléments au même nom dans un dossier (une note `x.md` à côté
 * d'une page `x`) sont départagés par un numéro ; à la racine, le nom `assets`
 * est réservé.
 */
export function planDArchive(racine: TreeNode, dossier = '', nom = nomDeLElement(racine)): ArchivePage {
  const dossierDesEnfants = joindre(dossier, nom);
  const pris = new Set<string>();
  const enfants = racine.enfants.map((enfant) => {
    let nomDeLEnfant = nomDeLElement(enfant);
    for (let numero = 2; pris.has(nomDeLEnfant.toLowerCase()); numero += 1) {
      nomDeLEnfant = `${nomDeLElement(enfant)} ${numero}`;
    }
    pris.add(nomDeLEnfant.toLowerCase());
    return planDArchive(enfant, dossierDesEnfants, nomDeLEnfant);
  });
  return { noeud: racine, fichier: `${dossierDesEnfants}.html`, dossierDesEnfants, enfants };
}

/** Plan d'une archive dont la page de départ est à la racine. */
export function planDeLArchive(racine: TreeNode): ArchivePage {
  const nom = nomDeLElement(racine);
  return planDArchive(racine, '', nom.toLowerCase() === dossierDesRessources ? `${nom} 2` : nom);
}

/** Toutes les pages du plan, dans l'ordre de l'arborescence. */
export function pagesDuPlan(plan: ArchivePage): ArchivePage[] {
  return [plan, ...plan.enfants.flatMap(pagesDuPlan)];
}

/** Adresse relative d'un fichier de l'archive vu depuis un autre : `../Autre.html`. Chaque morceau est encodé. */
export function adresseRelative(depuis: string, vers: string): string {
  const de = depuis.split('/').slice(0, -1);
  const cible = vers.split('/');
  let commun = 0;
  while (commun < de.length && commun < cible.length - 1 && de[commun] === cible[commun]) {
    commun += 1;
  }
  return [...de.slice(commun).map(() => '..'), ...cible.slice(commun).map(encodeURIComponent)].join('/');
}

/** Nom libre dans `assets/images/` pour une image, numéroté si le nom est pris (sans tenir compte de la casse). */
export function nomDImageLibre(nom: string, pris: Set<string>): string {
  const [, base = nom, extension = ''] = /^(.*?)(\.[^.]*)?$/.exec(nom) ?? [];
  let libre = nom;
  for (let numero = 2; pris.has(libre.toLowerCase()); numero += 1) {
    libre = `${base}-${numero}${extension}`;
  }
  pris.add(libre.toLowerCase());
  return libre;
}
