import { TextSelection } from '@tiptap/pm/state';
import type { EditorState } from '@tiptap/pm/state';

/** Le « @ » en cours de saisie : où il commence, où en est le curseur, ce qui est tapé après. */
export interface MentionTrigger {
  de: number;
  a: number;
  requete: string;
}

/** Un titre de page tient en quelques mots : au-delà, ce n'est plus une recherche. */
const motif = /(?:^|[\s(«"'])@([^@\n]{0,40})$/;

/**
 * Le choix d'une page s'ouvre quand le curseur suit un « @ » tapé en début de
 * bloc, après une espace ou une parenthèse (pas dans une adresse de courriel),
 * hors d'un bloc de code.
 */
export function declencheurDeMention(etat: EditorState): MentionTrigger | null {
  const { selection } = etat;
  if (!(selection instanceof TextSelection) || !selection.empty) {
    return null;
  }
  const position = selection.$from;
  if (!position.parent.isTextblock || position.parent.type.spec.code === true || position.marks().some((marque) => marque.type.name === 'code')) {
    return null;
  }
  // Une mention ou un saut de ligne déjà là coupe la recherche : ils comptent pour un caractère qui n'est pas du texte.
  const avant = position.parent.textBetween(0, position.parentOffset, undefined, '\n');
  const trouve = motif.exec(avant);
  if (trouve === null) {
    return null;
  }
  const requete = trouve[1] ?? '';
  // Une espace juste après « @ », ou deux de suite : l'utilisateur écrit autre chose.
  if (requete.startsWith(' ') || requete.includes('  ')) {
    return null;
  }
  return { de: selection.from - requete.length - 1, a: selection.from, requete };
}
