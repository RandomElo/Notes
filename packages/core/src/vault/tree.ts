import { joindreChemins, verifierCheminRelatif } from '../fs/paths';
import type { LocalFs } from '../fs/local-fs';
import { estFichierDeConflit } from '../page/conflict';
import { analyserPage } from '../page/page-file';
import { fichierPage } from '../page/types';
import type { PageMode } from '../page/types';
import { lireOrdre } from './order';

/**
 * Un élément de l'arborescence.
 * - page : dossier avec un page.md. Importée si son front-matter est valide.
 * - dossier : dossier sans page.md mais qui contient des notes. Jamais importé.
 * - fichier : fichier .md posé là par un autre outil. Jamais importé.
 * Un élément non importé est affiché mais rien n'y est écrit tant que
 * l'utilisateur ne demande pas son import (README §4).
 */
export interface TreeNode {
  /** Chemin dans le vault : le dossier de la page, ou le fichier .md pour un « fichier ». */
  chemin: string;
  genre: 'page' | 'dossier' | 'fichier';
  importe: boolean;
  /** Identifiant de la page, null tant qu'elle n'est pas importée. */
  id: string | null;
  titre: string;
  icone: string | null;
  mode: PageMode | null;
  enfants: TreeNode[];
}

const dossierAssets = 'assets';
const comparateur = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });

/** Ce qui ne fait jamais partie de l'arborescence. */
export function estIgnore(nom: string, estDossier: boolean): boolean {
  // Fichiers cachés, et noms que SMB refuserait : ils ne pourraient pas être synchronisés.
  if (nom.startsWith('.') || verifierCheminRelatif(nom) !== null) {
    return true;
  }
  if (estDossier) {
    return nom === dossierAssets;
  }
  // Sauvegardes de conflit de la sync (README §5) : ce ne sont pas des pages.
  return !nom.toLowerCase().endsWith('.md') || nom === fichierPage || estFichierDeConflit(nom);
}

/** Lit toute l'arborescence du vault. */
export async function lireArbre(fs: LocalFs): Promise<TreeNode[]> {
  return lireEnfants(fs, '');
}

/** Lit les enfants directs d'un dossier, dans l'ordre d'affichage, avec leur descendance. */
export async function lireEnfants(fs: LocalFs, dossier: string): Promise<TreeNode[]> {
  const noeuds: TreeNode[] = [];
  for (const entree of await fs.lister(dossier)) {
    if (estIgnore(entree.nom, entree.estDossier)) {
      continue;
    }
    const chemin = joindreChemins(dossier, entree.nom);
    if (!entree.estDossier) {
      noeuds.push(noeudNonImporte(chemin, 'fichier', entree.nom.slice(0, -'.md'.length), []));
      continue;
    }
    const noeud = await lireDossier(fs, chemin, entree.nom);
    if (noeud !== null) {
      noeuds.push(noeud);
    }
  }
  return ordonner(noeuds, await lireOrdre(fs, dossier));
}

async function lireDossier(fs: LocalFs, chemin: string, nom: string): Promise<TreeNode | null> {
  const enfants = await lireEnfants(fs, chemin);
  const cheminPage = joindreChemins(chemin, fichierPage);
  if ((await fs.infos(cheminPage)) === null) {
    // Un dossier sans note dedans n'a rien à faire dans l'arborescence.
    return enfants.length === 0 ? null : noeudNonImporte(chemin, 'dossier', nom, enfants);
  }
  const { meta } = analyserPage(await fs.lireTexte(cheminPage));
  if (meta === null) {
    return noeudNonImporte(chemin, 'page', nom, enfants);
  }
  return {
    chemin,
    genre: 'page',
    importe: true,
    id: meta.id,
    titre: meta.titre,
    icone: meta.icone,
    mode: meta.mode,
    enfants,
  };
}

function noeudNonImporte(chemin: string, genre: TreeNode['genre'], titre: string, enfants: TreeNode[]): TreeNode {
  return { chemin, genre, importe: false, id: null, titre, icone: null, mode: null, enfants };
}

/**
 * Ordre d'affichage : d'abord les pages listées dans `.order`, dans cet
 * ordre, puis les autres par titre.
 */
export function ordonner<T extends Pick<TreeNode, 'id' | 'titre' | 'chemin'>>(noeuds: T[], ordre: readonly string[]): T[] {
  const rang = new Map(ordre.map((id, index) => [id, index]));
  return [...noeuds].sort((a, b) => {
    const rangA = a.id === null ? undefined : rang.get(a.id);
    const rangB = b.id === null ? undefined : rang.get(b.id);
    if (rangA !== undefined && rangB !== undefined) {
      return rangA - rangB;
    }
    if (rangA !== undefined) {
      return -1;
    }
    if (rangB !== undefined) {
      return 1;
    }
    return comparateur.compare(a.titre, b.titre) || comparateur.compare(a.chemin, b.chemin);
  });
}

/** Cherche un élément par son chemin dans un arbre déjà lu. */
export function trouverNoeud(arbre: readonly TreeNode[], chemin: string): TreeNode | null {
  for (const noeud of arbre) {
    if (noeud.chemin === chemin) {
      return noeud;
    }
    if (chemin.startsWith(`${noeud.chemin}/`)) {
      const trouve = trouverNoeud(noeud.enfants, chemin);
      if (trouve !== null) {
        return trouve;
      }
    }
  }
  return null;
}
