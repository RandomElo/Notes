import { verifierCheminRelatif, verifierTitre } from '@notes/core';
import type { TreeNode } from '@notes/core';

/*
 * Pages créées sur le téléphone sans NAS (choix d'Eloi du 2026-10-10, seule
 * exception avec les mémos vocaux à « rien sans le NAS », docs/spec/android.md) : elles
 * attendent dans les fichiers de l'application, hors du cache, et sont créées
 * sur le NAS dès qu'il répond. D'ici là, elles sont dans l'arborescence et
 * s'écrivent (choix d'Eloi, 2026-10-11) : leur contenu attend avec elles, et
 * part avec la page. Aucun conflit possible, elle n'existe nulle part ailleurs.
 */

export interface PageEnAttente {
  /** Identifiant local, tiré au hasard. */
  cle: string;
  /** Dossier de la page parente, vide pour la racine. */
  parent: string;
  titre: string;
  modeListe: boolean;
  creeLe: number;
  /** Markdown écrit dans la page pendant qu'elle attend. */
  corps: string;
}

export const fichierDesPagesEnAttente = 'pages-en-attente.json';
const prefixe = 'attente:';

/** Chemin d'une page en attente dans l'arborescence : jamais un chemin du vault (« : » y est refusé). */
export function cheminEnAttente(cle: string): string {
  return `${prefixe}${cle}`;
}

export function estEnAttente(chemin: string): boolean {
  return chemin.startsWith(prefixe);
}

/** Lecture tolérante : une entrée abîmée est oubliée. */
export function lirePagesEnAttente(texte: string | null): PageEnAttente[] {
  let brut: unknown;
  try {
    brut = texte === null ? [] : JSON.parse(texte);
  } catch {
    return [];
  }
  if (!Array.isArray(brut)) {
    return [];
  }
  return brut.flatMap((entree: unknown): PageEnAttente[] => {
    if (typeof entree !== 'object' || entree === null) {
      return [];
    }
    const { cle, parent, titre, modeListe, creeLe, corps } = entree as Record<string, unknown>;
    const valide =
      typeof cle === 'string' &&
      /^[0-9a-z-]{8,64}$/i.test(cle) &&
      typeof parent === 'string' &&
      (parent === '' || verifierCheminRelatif(parent) === null) &&
      typeof titre === 'string' &&
      verifierTitre(titre) === null &&
      typeof creeLe === 'number';
    return valide ? [{ cle, parent, titre: titre.trim(), modeListe: modeListe === true, creeLe, corps: typeof corps === 'string' ? corps : '' }] : [];
  });
}

/** L'arborescence du cache avec les pages en attente, chacune en dernier sous son parent (ou à la racine si le parent a disparu). */
export function avecPagesEnAttente(arbre: readonly TreeNode[], attente: readonly PageEnAttente[]): TreeNode[] {
  if (attente.length === 0) {
    return [...arbre];
  }
  const noeud = (page: PageEnAttente): TreeNode => ({
    chemin: cheminEnAttente(page.cle),
    genre: 'page',
    importe: true,
    id: null,
    titre: page.titre,
    icone: null,
    mode: page.modeListe ? 'todo' : null,
    enfants: [],
  });
  const placees = new Set<string>();
  const parcourir = (noeuds: readonly TreeNode[]): TreeNode[] =>
    noeuds.map((existant) => {
      const enfants = attente.filter((page) => page.parent === existant.chemin);
      enfants.forEach((page) => placees.add(page.cle));
      const sous = parcourir(existant.enfants);
      return enfants.length === 0 && sous.every((enfant, index) => enfant === existant.enfants[index]) ? existant : { ...existant, enfants: [...sous, ...enfants.map(noeud)] };
    });
  const racine = parcourir(arbre);
  return [...racine, ...attente.filter((page) => !placees.has(page.cle)).map(noeud)];
}
