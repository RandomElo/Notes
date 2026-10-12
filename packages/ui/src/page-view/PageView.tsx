import { lireMarkdown } from '@notes/document';
import { EditorContent, useEditor } from '@tiptap/react';
import { useMemo } from 'react';
import { extensionsDAffichage } from './extensions';
import type { ImageViewOptions } from './node-views/image-view';
import type { MentionViewOptions } from './node-views/mention-view';
import type { SiteMentionOptions } from './site-mentions';

/** Classe qui porte les styles du contenu d'une page (styles/base.css). L'éditeur du desktop la met aussi. */
export const classeDePage = 'notes-page';

interface PageViewProps {
  /** Corps Markdown de la page, sans son front-matter. */
  corps: string;
  /** Adresse à charger pour une image de la page. Sans elle, les images ne s'affichent pas. */
  resoudreImage?: (src: string) => string | null;
  /** Texte d'une image sans adresse (en cours de téléchargement, pas encore copiée). */
  absenceImage?: ImageViewOptions['absence'];
  /** Ouvre une image en grand (toucher ou double-clic). */
  agrandirImage?: ImageViewOptions['agrandir'];
  /** Annuaire des pages, icônes et ouverture des mentions. Sans lui, une mention montre le texte du fichier. */
  mentions?: MentionViewOptions;
  /** Favicons des mentions de site. */
  sites?: SiteMentionOptions;
}

const sansImage = (): null => null;
const sansOptions = {};

/**
 * Rendu d'une page en lecture seule, avec le même schéma et les mêmes styles
 * que l'éditeur. Le contenu passe par le schéma TipTap : aucun HTML venu du
 * fichier n'est injecté.
 */
export function PageView({ corps, resoudreImage = sansImage, agrandirImage, absenceImage, mentions = sansOptions, sites = sansOptions }: PageViewProps) {
  const contenu = useMemo(() => lireMarkdown(corps).document.toJSON() as object, [corps]);
  const extensions = useMemo(() => {
    const images: ImageViewOptions = { resoudre: resoudreImage };
    if (agrandirImage !== undefined) {
      images.agrandir = agrandirImage;
    }
    if (absenceImage !== undefined) {
      images.absence = absenceImage;
    }
    return extensionsDAffichage(images, mentions, sites);
  }, [resoudreImage, agrandirImage, absenceImage, mentions, sites]);
  const editeur = useEditor(
    {
      extensions,
      content: contenu,
      editable: false,
      editorProps: { attributes: { class: classeDePage } },
    },
    [contenu, extensions],
  );
  return <EditorContent editor={editeur} />;
}
