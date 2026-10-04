import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Transform } from '@tiptap/pm/transform';
import { lireMarkdown } from '../markdown/parse';
import { ecrireMarkdown } from '../markdown/serialize';

/**
 * Positions des mentions de la page « id » dont le texte n'est pas « titre ».
 * Sert au renommage, dans un fichier comme dans l'éditeur ouvert.
 */
export function mentionsARenommer(document: ProseMirrorNode, id: string, titre: string): number[] {
  const positions: number[] = [];
  document.descendants((noeud, position) => {
    if (noeud.type.name === 'pageMention' && noeud.attrs['id'] === id && noeud.attrs['libelle'] !== titre) {
      positions.push(position);
    }
  });
  return positions;
}

/**
 * Corps d'une page dont les mentions de la page « id » portent le texte
 * « titre » (README §6, une page renommée). Seuls les blocs qui contiennent
 * une telle mention sont réécrits, le reste du fichier ne change pas d'un
 * octet. null si la page ne la mentionne pas ou si tout est déjà à jour.
 */
export function renommerMentions(corps: string, id: string, titre: string): string | null {
  const { document, source } = lireMarkdown(corps);
  const positions = mentionsARenommer(document, id, titre);
  if (positions.length === 0) {
    return null;
  }
  const transformation = new Transform(document);
  for (const position of positions) {
    transformation.setNodeAttribute(position, 'libelle', titre);
  }
  return ecrireMarkdown(transformation.doc, source);
}
