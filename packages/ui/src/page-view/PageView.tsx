import { lireMarkdown } from '@notes/document';
import { EditorContent, useEditor } from '@tiptap/react';
import { useMemo } from 'react';
import { extensionsDAffichage } from './extensions';

/** Classe qui porte les styles du contenu d'une page (styles/base.css). L'éditeur du desktop la met aussi. */
export const classeDePage = 'notes-page';

interface PageViewProps {
  /** Corps Markdown de la page, sans son front-matter. */
  corps: string;
  /** Adresse à charger pour une image de la page. Sans elle, les images ne s'affichent pas. */
  resoudreImage?: (src: string) => string | null;
}

const sansImage = (): null => null;

/**
 * Rendu d'une page en lecture seule, avec le même schéma et les mêmes styles
 * que l'éditeur. Le contenu passe par le schéma TipTap : aucun HTML venu du
 * fichier n'est injecté.
 */
export function PageView({ corps, resoudreImage = sansImage }: PageViewProps) {
  const contenu = useMemo(() => lireMarkdown(corps).document.toJSON() as object, [corps]);
  const extensions = useMemo(() => extensionsDAffichage({ resoudre: resoudreImage }), [resoudreImage]);
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
