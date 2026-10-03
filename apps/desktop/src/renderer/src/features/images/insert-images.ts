import type { Editor } from '@tiptap/core';

/**
 * Insère des images à « position » : à la place du paragraphe vide qui s'y
 * trouve, sinon sous le bloc qui la contient. La dernière image insérée est
 * sélectionnée, pour régler tout de suite sa largeur ou sa légende.
 */
export function insererImages(editor: Editor, adresses: string[], position: number): void {
  if (adresses.length === 0 || editor.isDestroyed) {
    return;
  }
  const images = adresses.map((src) => ({ type: 'image', attrs: { src, alt: '', title: null, largeur: null, alignement: null } }));
  const $position = editor.state.doc.resolve(Math.min(position, editor.state.doc.content.size));
  // Les images vont au premier niveau : pas dans une cellule de tableau, un callout ou un item de liste.
  const remplace = $position.depth === 1 && $position.parent.type.name === 'paragraph' && $position.parent.content.size === 0;
  const de = $position.depth === 0 ? $position.pos : remplace ? $position.before(1) : $position.after(1);
  const a = remplace ? $position.after(1) : de;
  editor.chain().focus().insertContentAt({ from: de, to: a }, images).run();
  // Chaque image occupe une position : la dernière commence à de + n - 1.
  editor.commands.setNodeSelection(de + adresses.length - 1);
}

/** Les fichiers d'image d'un glisser-déposer ou d'un collage. */
export function fichiersDImage(donnees: DataTransfer | null): File[] {
  return [...(donnees?.files ?? [])].filter((fichier) => fichier.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(fichier.name));
}
