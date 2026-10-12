import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

/** Un titre de la page, pour le sommaire (docs/spec/interface.md). */
export interface OutlineEntry {
  /** Niveau du titre dans le contenu, de 1 à 5. */
  niveau: number;
  /** Rang dans l'arbre du sommaire : 0 pour un titre sans titre parent, un de plus par titre qui l'englobe. */
  profondeur: number;
  texte: string;
  /** Position du titre dans le document, pour y emmener le curseur ou la vue. */
  position: number;
}

/**
 * Les titres de la page, dans l'ordre de lecture, y compris ceux d'un
 * callout. Un titre vide est gardé (il existe dans la page) ; c'est
 * l'affichage qui lui donne un libellé. La profondeur suit l'emboîtement
 * réel : un niveau 3 juste sous un niveau 1 est un cran plus bas, pas deux.
 */
export function extraireSommaire(document: ProseMirrorNode): OutlineEntry[] {
  const entrees: OutlineEntry[] = [];
  // Niveaux des titres qui englobent le titre courant, du plus haut au plus proche.
  const englobants: number[] = [];
  document.descendants((noeud, position) => {
    if (noeud.type.name !== 'heading') {
      return true;
    }
    const niveau = Number(noeud.attrs['level']);
    while (englobants.length > 0 && (englobants.at(-1) ?? 0) >= niveau) {
      englobants.pop();
    }
    entrees.push({ niveau, profondeur: englobants.length, texte: noeud.textContent.trim(), position });
    englobants.push(niveau);
    return false;
  });
  return entrees;
}

