import { extensionsDuSchema } from '@notes/document';
import type { AnyExtension, Extensions } from '@tiptap/core';
import { CalloutAvecVue } from './node-views/callout-view';
import { CodeHighlight } from './node-views/code-highlight';
import { imageAvecVue } from './node-views/image-view';
import type { ImageViewOptions } from './node-views/image-view';

/**
 * Le schéma d'une page avec ce qu'il faut pour l'afficher : coloration du
 * code, vues des images et des callouts. L'éditeur du desktop et le rendu en lecture seule
 * partent de cette liste.
 */
export function extensionsDAffichage(images: ImageViewOptions): Extensions {
  const vues: Record<string, AnyExtension> = { image: imageAvecVue(images), callout: CalloutAvecVue };
  return [...extensionsDuSchema.map((extension) => vues[extension.name] ?? extension), CodeHighlight];
}
