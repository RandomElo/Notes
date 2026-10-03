import { assemblerTexte } from '@notes/document';
import type { ConflictRow } from '@notes/document';

/**
 * État de l'écran des conflits (README §5), sans React : ce qui a été choisi
 * pour chaque différence, et le corps qui en sort. A est la page, B la
 * version mise de côté. Chaque fonction rend un nouvel état.
 */

export type Cote = 'a' | 'b';

/** Ce que la page garde d'un bloc. « aucun » : le bloc est retiré. */
export type BlockChoice = 'a' | 'b' | 'ab' | 'aucun';

/** Dans un paragraphe fusionné : un mot commun aux deux versions, ou le passage propre à l'une. */
export type Jeton = { mot: string } | { cote: Cote; texte: string };

export type ConflictLine =
  | { id: number; genre: 'pareil'; texte: string }
  | { id: number; genre: 'bloc'; a: string | null; b: string | null; choix: BlockChoice | null; deplace: boolean }
  | { id: number; genre: 'texte'; origine: Extract<ConflictRow, { genre: 'texte' }>; jetons: Jeton[]; reglee: boolean };

export type ConflictState = ConflictLine[];

export function creerEtat(lignes: readonly ConflictRow[]): ConflictState {
  return lignes.map((ligne, id) => {
    if (ligne.genre === 'pareil') {
      return { id, genre: 'pareil', texte: ligne.texte };
    }
    if (ligne.genre === 'bloc') {
      return { id, genre: 'bloc', a: ligne.a, b: ligne.b, choix: null, deplace: false };
    }
    return { id, genre: 'texte', origine: ligne, jetons: jetonsDeDepart(ligne), reglee: false };
  });
}

/** Les deux passages l'un après l'autre, B après A. Un passage vide n'a pas de morceau. */
function jetonsDeDepart(ligne: Extract<ConflictRow, { genre: 'texte' }>): Jeton[] {
  const morceaux: Jeton[] = [];
  if (ligne.a !== '') {
    morceaux.push({ cote: 'a', texte: ligne.a });
  }
  if (ligne.b !== '') {
    morceaux.push({ cote: 'b', texte: ligne.b });
  }
  return [...ligne.avant.map((mot) => ({ mot })), ...morceaux, ...ligne.apres.map((mot) => ({ mot }))];
}

export function estReglee(ligne: ConflictLine): boolean {
  return ligne.genre === 'pareil' || (ligne.genre === 'bloc' ? ligne.choix !== null : ligne.reglee);
}

/** Différences encore à régler : « Valider » attend qu'il n'en reste aucune. */
export function restantes(etat: ConflictState): number {
  return etat.filter((ligne) => !estReglee(ligne)).length;
}

function remplacer(etat: ConflictState, id: number, changer: (ligne: ConflictLine) => ConflictLine): ConflictState {
  return etat.map((ligne) => (ligne.id === id ? changer(ligne) : ligne));
}

export function choisirBloc(etat: ConflictState, id: number, choix: BlockChoice): ConflictState {
  return remplacer(etat, id, (ligne) => (ligne.genre === 'bloc' ? { ...ligne, choix } : ligne));
}

/** Paragraphe : garder un seul passage, ou les deux tels qu'ils sont placés. */
export function garderTexte(etat: ConflictState, id: number, garde: Cote | 'affiche'): ConflictState {
  return remplacer(etat, id, (ligne) => {
    if (ligne.genre !== 'texte') {
      return ligne;
    }
    const jetons = garde === 'affiche' ? ligne.jetons : jetonsDeDepart(ligne.origine).filter((jeton) => !('cote' in jeton) || jeton.cote === garde);
    return { ...ligne, jetons, reglee: true };
  });
}

/** Paragraphe : retour aux deux passages à leur place de départ, à régler de nouveau. */
export function recommencerTexte(etat: ConflictState, id: number): ConflictState {
  return remplacer(etat, id, (ligne) => (ligne.genre === 'texte' ? { ...ligne, jetons: jetonsDeDepart(ligne.origine), reglee: false } : ligne));
}

export function retirerMorceau(etat: ConflictState, id: number, indice: number): ConflictState {
  return remplacer(etat, id, (ligne) => (ligne.genre === 'texte' ? { ...ligne, jetons: ligne.jetons.filter((_, autre) => autre !== indice), reglee: true } : ligne));
}

/** Déplace le jeton `de` pour qu'il se retrouve avant celui qui était en position `avant` (la longueur pour la fin). */
export function deplacerMorceau(etat: ConflictState, id: number, de: number, avant: number): ConflictState {
  return remplacer(etat, id, (ligne) => {
    if (ligne.genre !== 'texte' || de < 0 || de >= ligne.jetons.length) {
      return ligne;
    }
    const jetons = [...ligne.jetons];
    const [pris] = jetons.splice(de, 1) as [Jeton];
    jetons.splice(Math.max(0, Math.min(jetons.length, avant > de ? avant - 1 : avant)), 0, pris);
    return { ...ligne, jetons, reglee: true };
  });
}

/**
 * Sort la version `cote` d'un bloc et la pose comme bloc à part avant la
 * ligne de position `cible` (la longueur pour la fin). La version restée en
 * place est gardée d'office, sauf si elle avait déjà été écartée (décision
 * d'Eloi du 2026-10-03). Rend le nouvel état et l'identifiant du bloc déplacé.
 */
export function deplacerBloc(etat: ConflictState, id: number, cote: Cote, cible: number): { etat: ConflictState; id: number } {
  const position = etat.findIndex((ligne) => ligne.id === id);
  const ligne = etat[position];
  if (ligne?.genre !== 'bloc' || ligne[cote] === null) {
    return { etat, id };
  }
  const autre: Cote = cote === 'a' ? 'b' : 'a';
  const resteSeul = ligne[autre] === null;
  // Un bloc seul posé juste avant ou après lui-même ne bouge pas.
  if (resteSeul && (cible === position || cible === position + 1)) {
    return { etat, id };
  }
  const nouvelId = Math.max(...etat.map((autreLigne) => autreLigne.id)) + 1;
  const deplace: ConflictLine = { id: nouvelId, genre: 'bloc', a: cote === 'a' ? ligne.a : null, b: cote === 'b' ? ligne.b : null, choix: cote, deplace: true };
  const suivant = [...etat];
  let ou = cible;
  if (resteSeul) {
    suivant.splice(position, 1);
    if (cible > position) {
      ou--;
    }
  } else {
    const choix: BlockChoice = ligne.choix === null || ligne.choix === autre || ligne.choix === 'ab' ? autre : 'aucun';
    suivant[position] = { ...ligne, [cote]: null, choix };
  }
  suivant.splice(Math.max(0, Math.min(suivant.length, ou)), 0, deplace);
  return { etat: suivant, id: nouvelId };
}

/** « Tout A » ou « Tout B » : chaque différence prend ce côté, les déplacements sont oubliés. */
export function toutPrendre(depart: ConflictState, cote: Cote): ConflictState {
  return depart.map((ligne) => {
    if (ligne.genre === 'bloc') {
      return { ...ligne, choix: ligne[cote] === null ? 'aucun' : cote };
    }
    if (ligne.genre === 'texte') {
      return { ...ligne, jetons: jetonsDeDepart(ligne.origine).filter((jeton) => !('cote' in jeton) || jeton.cote === cote), reglee: true };
    }
    return ligne;
  });
}

/** Texte Markdown de chaque bloc gardé, dans l'ordre de la page. */
export function blocsRetenus(etat: ConflictState): string[] {
  const blocs: string[] = [];
  for (const ligne of etat) {
    if (ligne.genre === 'pareil') {
      blocs.push(ligne.texte);
    } else if (ligne.genre === 'bloc') {
      if ((ligne.choix === 'a' || ligne.choix === 'ab') && ligne.a !== null) {
        blocs.push(ligne.a);
      }
      if ((ligne.choix === 'b' || ligne.choix === 'ab') && ligne.b !== null) {
        blocs.push(ligne.b);
      }
    } else {
      const texte = assemblerTexte(ligne.jetons.map((jeton) => ('mot' in jeton ? jeton.mot : jeton.texte)));
      if (texte.trim() !== '' && !/^#+$/.test(texte.trim())) {
        blocs.push(texte);
      }
    }
  }
  return blocs;
}
