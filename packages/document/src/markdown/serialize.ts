import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { blocCanonique, marqueurDuTexte, marqueurLibre } from './canonical';
import type { ListMarker } from './canonical';
import { lireMarkdown } from './parse';
import type { FinDeLigne, PageSource } from './types';

/**
 * Écrit le corps Markdown d'un document.
 *
 * Avec la source de la page (rendue par lireMarkdown), chaque bloc de premier
 * niveau qui n'a pas changé ressort avec son texte d'origine, à l'octet près,
 * et seuls les blocs nouveaux ou modifiés sont écrits en forme canonique. Un
 * document non modifié redonne donc exactement le fichier lu.
 *
 * Sans source, tout est écrit en forme canonique.
 */
export function ecrireMarkdown(document: ProseMirrorNode, source: PageSource | null = null): string {
  const blocs = blocsAEcrire(document);
  const finDeLigne = source?.finDeLigne ?? '\n';
  if (source === null || source.blocs.length === 0) {
    // Corps vide ou fait de lignes vides : il reste tel quel tant que rien n'est écrit dans la page.
    return blocs.length === 0 ? (source?.prefixe ?? '') : toutCanonique(blocs, finDeLigne);
  }
  if (blocs.length === 0) {
    return '';
  }

  const origines = apparier(blocs, source.blocs.map((bloc) => bloc.noeud));
  const dernier = source.blocs.length - 1;
  // Texte d'origine de chaque bloc inchangé, null pour ceux qui sont à écrire.
  const gardes = origines.map((origine) => (origine === -1 ? null : (source.blocs[origine] as PageSource['blocs'][number]).texte));
  const textes = ecrireBlocs(blocs, gardes, finDeLigne);
  let texte = source.prefixe;
  blocs.forEach((_bloc, index) => {
    const origine = origines[index] as number;
    texte += textes[index] as string;
    if (index < blocs.length - 1) {
      // Deux blocs restés voisins gardent ce qui les séparait. Sinon, une ligne vide.
      const voisins = origine !== -1 && origines[index + 1] === origine + 1;
      texte += voisins ? (source.blocs[origine] as PageSource['blocs'][number]).separateur : finDeLigne + finDeLigne;
    } else {
      // La fin du fichier garde sa forme (avec ou sans fin de ligne), sauf si un bloc est ajouté à un fichier qui n'en avait pas.
      const finDOrigine = (source.blocs[dernier] as PageSource['blocs'][number]).separateur;
      texte += origine === dernier || finDOrigine !== '' ? finDOrigine : finDeLigne;
    }
  });

  if (origines.every((origine, index) => origine === index) && blocs.length === source.blocs.length) {
    return texte;
  }
  // Filet de sécurité : chaque bloc doit se relire à sa place comme il se lit seul. Un bloc
  // peut changer de sens en changeant de voisin (clôture de code non fermée, par exemple).
  return seRelitBlocParBloc(texte, textes, blocs, gardes) ? texte : toutCanonique(blocs, finDeLigne);
}

/** Les blocs de premier niveau, sans les paragraphes vides. */
function blocsAEcrire(document: ProseMirrorNode): ProseMirrorNode[] {
  const blocs: ProseMirrorNode[] = [];
  document.forEach((bloc) => {
    // Un paragraphe sans texte (vide, ou fait d'espaces et de sauts de ligne) n'a pas d'écriture en Markdown.
    if (!(bloc.type.name === 'paragraph' && bloc.textContent.trim() === '')) {
      blocs.push(bloc);
    }
  });
  return blocs;
}

/**
 * Texte de chaque bloc : celui d'origine quand il est gardé, la forme canonique sinon.
 *
 * Deux listes voisines de même nature seraient relues comme une seule : une
 * liste réécrite prend donc un autre marqueur que ses voisines (voir
 * canonical.ts). La voisine de gauche est déjà écrite. Celle de droite l'est
 * d'avance si son texte est gardé, et se prévoit de droite à gauche sinon.
 */
function ecrireBlocs(blocs: ProseMirrorNode[], gardes: (string | null)[], finDeLigne: FinDeLigne): string[] {
  // Marqueur du bloc suivant, quand il est déjà connu ou prévisible. Calculé en partant de la fin.
  const suivants = new Array<ListMarker | null>(blocs.length).fill(null);
  for (let index = blocs.length - 2; index >= 0; index--) {
    const suivant = blocs[index + 1] as ProseMirrorNode;
    const garde = gardes[index + 1] ?? (suivant.type.name === 'rawBlock' ? String(suivant.attrs['source']) : null);
    if (garde !== null) {
      suivants[index] = marqueurDuTexte(suivant, garde);
    } else if (suivants[index + 1] !== null) {
      suivants[index] = marqueurLibre(suivant, [suivants[index + 1] as ListMarker]);
    }
  }

  let precedent: ListMarker | null = null;
  return blocs.map((bloc, index) => {
    let texte = gardes[index] ?? null;
    if (texte === null) {
      const voisins = [precedent, suivants[index] ?? null].filter((voisin) => voisin !== null);
      texte = blocCanonique(bloc, voisins);
      if (finDeLigne !== '\n') {
        texte = texte.replace(/\n/g, finDeLigne);
      }
    }
    precedent = marqueurDuTexte(bloc, texte);
    return texte;
  });
}

function toutCanonique(blocs: ProseMirrorNode[], finDeLigne: FinDeLigne): string {
  return ecrireBlocs(blocs, blocs.map(() => null), finDeLigne).join(finDeLigne + finDeLigne) + finDeLigne;
}

/**
 * Un bloc gardé doit se relire comme le bloc du document : son texte n'a pas
 * changé, son sens non plus. Un bloc réécrit doit se relire à sa place comme il
 * se lit seul : l'écriture peut le normaliser (espaces sortis d'un gras), pas
 * le mêler à ses voisins.
 */
function seRelitBlocParBloc(texte: string, textes: string[], blocs: ProseMirrorNode[], gardes: (string | null)[]): boolean {
  const relus = blocsAEcrire(lireMarkdown(texte).document);
  return (
    relus.length === textes.length &&
    textes.every((seul, index) => {
      const relu = relus[index] as ProseMirrorNode;
      if (gardes[index] !== null) {
        return relu.eq(blocs[index] as ProseMirrorNode);
      }
      const lu = blocsAEcrire(lireMarkdown(seul).document);
      return lu.length === 1 && (lu[0] as ProseMirrorNode).eq(relu);
    })
  );
}

/** Au-delà, l'appariement du milieu coûterait trop cher : ces blocs sont réécrits en forme canonique. */
const tailleMaxDuMilieu = 250_000;

/**
 * Pour chaque bloc actuel, l'index du bloc d'origine identique, ou -1 : début
 * commun, fin commune, plus longue suite commune au milieu, puis les blocs
 * simplement déplacés, qui retrouvent eux aussi leur texte d'origine.
 */
function apparier(actuels: ProseMirrorNode[], origines: ProseMirrorNode[]): number[] {
  const resultat = apparierDansLOrdre(actuels, origines);
  const pris = new Set(resultat);
  resultat.forEach((origine, index) => {
    if (origine !== -1) {
      return;
    }
    const trouve = origines.findIndex((candidat, o) => !pris.has(o) && candidat.eq(actuels[index] as ProseMirrorNode));
    if (trouve !== -1) {
      resultat[index] = trouve;
      pris.add(trouve);
    }
  });
  return resultat;
}

function apparierDansLOrdre(actuels: ProseMirrorNode[], origines: ProseMirrorNode[]): number[] {
  const resultat = new Array<number>(actuels.length).fill(-1);
  const identiques = (a: number, o: number): boolean => (actuels[a] as ProseMirrorNode).eq(origines[o] as ProseMirrorNode);

  let debut = 0;
  while (debut < actuels.length && debut < origines.length && identiques(debut, debut)) {
    resultat[debut] = debut;
    debut++;
  }
  let finA = actuels.length;
  let finO = origines.length;
  while (finA > debut && finO > debut && identiques(finA - 1, finO - 1)) {
    finA--;
    finO--;
    resultat[finA] = finO;
  }

  const n = finA - debut;
  const m = finO - debut;
  if (n === 0 || m === 0 || n * m > tailleMaxDuMilieu) {
    return resultat;
  }
  // longueurs[i][j] : plus longue suite commune entre actuels[debut+i..] et origines[debut+j..].
  const longueurs = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  const lire = (i: number, j: number): number => (longueurs[i] as number[])[j] as number;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      (longueurs[i] as number[])[j] = identiques(debut + i, debut + j) ? lire(i + 1, j + 1) + 1 : Math.max(lire(i + 1, j), lire(i, j + 1));
    }
  }
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (identiques(debut + i, debut + j)) {
      resultat[debut + i] = debut + j;
      i++;
      j++;
    } else if (lire(i + 1, j) >= lire(i, j + 1)) {
      i++;
    } else {
      j++;
    }
  }
  return resultat;
}
