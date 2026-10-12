import type { TreeNode } from '@notes/core';

/*
 * Copie de l'arborescence et du thème dans les fichiers de l'application
 * (demande d'Eloi, 0.15.7 : lancement trop long). Lire l'arborescence relit
 * chaque page du cache ; au lancement, on montre cette copie tout de suite,
 * puis on relit le cache en arrière-plan.
 */

export const fichierDeLArborescence = 'arborescence.json';

export interface TreeSnapshot {
  arbre: TreeNode[];
  /** Texte de `.notes/theme.toml`, null s'il n'y en a pas. */
  theme: string | null;
}

function estNoeud(valeur: unknown): valeur is TreeNode {
  if (typeof valeur !== 'object' || valeur === null) {
    return false;
  }
  const noeud = valeur as Record<string, unknown>;
  return (
    typeof noeud['chemin'] === 'string' &&
    (noeud['genre'] === 'page' || noeud['genre'] === 'dossier' || noeud['genre'] === 'fichier') &&
    typeof noeud['titre'] === 'string' &&
    Array.isArray(noeud['enfants']) &&
    noeud['enfants'].every(estNoeud)
  );
}

export function ecrireCopie(cle: string, copie: TreeSnapshot): string {
  return JSON.stringify({ version: 1, cle, ...copie });
}

/** La copie enregistrée, si elle est lisible et faite pour ce NAS et ce dossier. Sinon null : on relit le cache. */
export function lireCopie(texte: string | null, cle: string): TreeSnapshot | null {
  try {
    const brut: unknown = texte === null ? null : JSON.parse(texte);
    if (typeof brut !== 'object' || brut === null) {
      return null;
    }
    const { version, cle: sienne, arbre, theme } = brut as Record<string, unknown>;
    if (version !== 1 || sienne !== cle || !Array.isArray(arbre) || !arbre.every(estNoeud) || (theme !== null && typeof theme !== 'string')) {
      return null;
    }
    return { arbre, theme };
  } catch {
    return null;
  }
}
