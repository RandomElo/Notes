import { extensionsDuSchema } from '@notes/document';
import type { AnyExtension, Extensions } from '@tiptap/core';
import { CalloutAvecVue } from './node-views/callout-view';
import { CodeHighlight } from './node-views/code-highlight';
import { imageAvecVue } from './node-views/image-view';
import type { ImageViewOptions } from './node-views/image-view';
import { mentionAvecVue } from './node-views/mention-view';
import type { MentionViewOptions } from './node-views/mention-view';
import { lienAvecMentionsDeSite } from './site-mentions';
import type { SiteMentionOptions } from './site-mentions';

/**
 * Le schéma d'une page avec ce qu'il faut pour l'afficher : coloration du
 * code, vues des images, des callouts et des mentions. L'éditeur du desktop et le rendu en lecture seule
 * partent de cette liste.
 */
export function extensionsDAffichage(images: ImageViewOptions, mentions: MentionViewOptions = {}, sites: SiteMentionOptions = {}): Extensions {
  const vues: Record<string, AnyExtension> = { image: imageAvecVue(images), callout: CalloutAvecVue, pageMention: mentionAvecVue(mentions) };
  return [
    ...extensionsDuSchema.map((extension) => (extension.name === 'link' ? lienAvecMentionsDeSite(extension, sites) : (vues[extension.name] ?? extension))),
    CodeHighlight,
  ];
}
