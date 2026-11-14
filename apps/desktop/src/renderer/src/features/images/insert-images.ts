import type { Editor } from '@tiptap/core';
import type { ResolvedPos } from '@tiptap/pm/model';

/** Profondeur de l'item de liste (puce, numéro, tâche) le plus proche qui contient la position, null hors liste. */
function profondeurDeLItem($position: ResolvedPos): number | null {
  for (let profondeur = $position.depth; profondeur >= 1; profondeur--) {
    const nom = $position.node(profondeur).type.name;
    if (nom === 'listItem' || nom === 'taskItem') {
      return profondeur;
    }
    if (nom === 'tableCell' || nom === 'tableHeader' || nom === 'callout') {
      return null;
    }
  }
  return null;
}

/**
 * Insère des images à « position » : à la place du paragraphe vide qui s'y
 * trouve, sinon sous le bloc qui la contient. Dans un item de liste (une tâche
 * de la page « Correctifs »), elles vont dans l'item, sous son texte ; ailleurs,
 * au premier niveau. La dernière image insérée est sélectionnée, pour régler
 * tout de suite sa largeur ou sa légende.
 */
export function insererImages(editor: Editor, adresses: string[], position: number): void {
  if (adresses.length === 0 || editor.isDestroyed) {
    return;
  }
  const images = adresses.map((src) => ({ type: 'image', attrs: { src, alt: '', title: null, largeur: null, alignement: null } }));
  const $position = editor.state.doc.resolve(Math.min(position, editor.state.doc.content.size));
  const item = profondeurDeLItem($position);
  // Le bloc de l'item qui contient le curseur (son texte, ou un bloc dessous), sinon le bloc de premier niveau.
  // Pas dans une cellule de tableau ni dans un callout : l'image va alors sous eux.
  const niveau = item === null ? 1 : item + 1;
  const bloc = $position.depth >= niveau ? $position.node(niveau) : null;
  // Le texte d'un item reste : seul un paragraphe vide posé dessous est remplacé.
  const remplace = bloc !== null && bloc.type.name === 'paragraph' && bloc.content.size === 0 && (item === null || $position.index(item) > 0);
  const de = $position.depth < niveau ? $position.pos : remplace ? $position.before(niveau) : $position.after(niveau);
  const a = remplace ? $position.after(niveau) : de;
  editor.chain().focus().insertContentAt({ from: de, to: a }, images).run();
  // Chaque image occupe une position : la dernière commence à de + n - 1.
  editor.commands.setNodeSelection(de + adresses.length - 1);
}

/** Les fichiers d'image d'un glisser-déposer ou d'un collage. */
export function fichiersDImage(donnees: DataTransfer | null): File[] {
  return [...(donnees?.files ?? [])].filter((fichier) => fichier.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(fichier.name));
}
