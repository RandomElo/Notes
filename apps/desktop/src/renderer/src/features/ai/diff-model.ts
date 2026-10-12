import { diffLines, diffWordsWithSpace } from 'diff';

/**
 * Vue de comparaison avant/après d'une proposition de l'IA (docs/spec/ia.md) :
 * lignes alignées, et dans une ligne modifiée, les mots qui changent.
 */

export interface Segment {
  texte: string;
  /** Retiré (côté avant) ou ajouté (côté après). */
  change: boolean;
}

export type RowKind = 'egal' | 'modifie' | 'retire' | 'ajoute';

export interface DiffRow {
  genre: RowKind;
  /** null quand la ligne n'existe que d'un côté. */
  avant: Segment[] | null;
  apres: Segment[] | null;
}

/** Les lignes d'un morceau de `diffLines`, sans la ligne vide que laisse la fin de ligne finale. */
function lignesDe(valeur: string): string[] {
  const lignes = valeur.split('\n');
  if (lignes[lignes.length - 1] === '') {
    lignes.pop();
  }
  return lignes;
}

/** Les mots qui changent entre deux versions d'une ligne. */
export function comparerMots(avant: string, apres: string): { avant: Segment[]; apres: Segment[] } {
  const resultat = { avant: [] as Segment[], apres: [] as Segment[] };
  for (const morceau of diffWordsWithSpace(avant, apres)) {
    if (!morceau.added) {
      resultat.avant.push({ texte: morceau.value, change: morceau.removed });
    }
    if (!morceau.removed) {
      resultat.apres.push({ texte: morceau.value, change: morceau.added });
    }
  }
  return resultat;
}

/** Compare deux textes ligne à ligne. Un bloc de lignes retirées suivi d'un bloc ajouté est apparié ligne à ligne. */
export function comparerTextes(avant: string, apres: string): DiffRow[] {
  const lignes: DiffRow[] = [];
  const morceaux = diffLines(avant, apres);
  for (let index = 0; index < morceaux.length; index++) {
    const morceau = morceaux[index]!;
    if (!morceau.added && !morceau.removed) {
      for (const ligne of lignesDe(morceau.value)) {
        lignes.push({ genre: 'egal', avant: [{ texte: ligne, change: false }], apres: [{ texte: ligne, change: false }] });
      }
      continue;
    }
    const suivant = morceaux[index + 1];
    const retirees = morceau.removed ? lignesDe(morceau.value) : [];
    const ajoutees = morceau.added ? lignesDe(morceau.value) : morceau.removed && suivant?.added === true ? lignesDe(suivant.value) : [];
    if (morceau.removed && suivant?.added === true) {
      index += 1;
    }
    const communes = Math.min(retirees.length, ajoutees.length);
    for (let rang = 0; rang < Math.max(retirees.length, ajoutees.length); rang++) {
      if (rang < communes) {
        const mots = comparerMots(retirees[rang]!, ajoutees[rang]!);
        lignes.push({ genre: 'modifie', ...mots });
      } else if (rang < retirees.length) {
        lignes.push({ genre: 'retire', avant: [{ texte: retirees[rang]!, change: true }], apres: null });
      } else {
        lignes.push({ genre: 'ajoute', avant: null, apres: [{ texte: ajoutees[rang]!, change: true }] });
      }
    }
  }
  return lignes;
}

export type DisplayRow = { genre: 'ligne'; ligne: DiffRow } | { genre: 'replie'; nombre: number; debut: number };

/**
 * Lignes à montrer : les longues suites de lignes identiques sont repliées,
 * sauf quelques lignes de contexte autour de chaque changement.
 */
export function replier(lignes: readonly DiffRow[], contexte = 2): DisplayRow[] {
  const garder = lignes.map((ligne) => ligne.genre !== 'egal');
  const visibles = lignes.map((_, index) => {
    for (let ecart = -contexte; ecart <= contexte; ecart++) {
      if (garder[index + ecart] === true) {
        return true;
      }
    }
    return false;
  });
  const resultat: DisplayRow[] = [];
  let index = 0;
  while (index < lignes.length) {
    if (visibles[index]) {
      resultat.push({ genre: 'ligne', ligne: lignes[index]! });
      index += 1;
      continue;
    }
    const debut = index;
    while (index < lignes.length && !visibles[index]) {
      index += 1;
    }
    // Replier une seule ligne ne fait rien gagner.
    if (index - debut === 1) {
      resultat.push({ genre: 'ligne', ligne: lignes[debut]! });
    } else {
      resultat.push({ genre: 'replie', nombre: index - debut, debut });
    }
  }
  return resultat;
}

/** Nombre de lignes modifiées, retirées et ajoutées, pour le résumé de la comparaison. */
export function resumer(lignes: readonly DiffRow[]): Record<Exclude<RowKind, 'egal'>, number> {
  const compte = { modifie: 0, retire: 0, ajoute: 0 };
  for (const ligne of lignes) {
    if (ligne.genre !== 'egal') {
      compte[ligne.genre] += 1;
    }
  }
  return compte;
}
