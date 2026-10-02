import { TextSelection } from '@tiptap/pm/state';
import type { EditorState } from '@tiptap/pm/state';

/** Le « / » en cours de saisie : où il commence, où en est le curseur, ce qui est tapé après. */
export interface SlashTrigger {
  de: number;
  a: number;
  requete: string;
}

/** Recherche d'au plus quelques mots : au-delà, ce n'est plus une commande. */
const motif = /(?:^|\s)\/([^/\n]{0,30})$/;

/**
 * Le menu « / » s'ouvre quand le curseur suit un « / » tapé en début de bloc
 * ou après une espace (pas dans « et/ou » ni dans une date), hors d'un bloc de code.
 */
export function declencheur(etat: EditorState): SlashTrigger | null {
  const { selection } = etat;
  if (!(selection instanceof TextSelection) || !selection.empty) {
    return null;
  }
  const position = selection.$from;
  if (!position.parent.isTextblock || position.parent.type.spec.code === true) {
    return null;
  }
  // Un nœud qui n'est pas du texte (saut de ligne forcé) coupe la recherche.
  const avant = position.parent.textBetween(0, position.parentOffset, undefined, '\n');
  const trouve = motif.exec(avant);
  if (trouve === null) {
    return null;
  }
  const requete = trouve[1] ?? '';
  // Deux espaces de suite, ou une espace juste après « / » : l'utilisateur écrit autre chose.
  if (requete.startsWith(' ') || requete.includes('  ')) {
    return null;
  }
  return { de: selection.from - requete.length - 1, a: selection.from, requete };
}
