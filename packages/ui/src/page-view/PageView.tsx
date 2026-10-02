import { extensionsDuSchema, lireMarkdown } from '@notes/document';
import { EditorContent, useEditor } from '@tiptap/react';
import { useMemo } from 'react';

/** Classe qui porte les styles du contenu d'une page (styles/base.css). L'éditeur du desktop la met aussi. */
export const classeDePage = 'notes-page';

interface PageViewProps {
  /** Corps Markdown de la page, sans son front-matter. */
  corps: string;
}

/**
 * Rendu d'une page en lecture seule, avec le même schéma et les mêmes styles
 * que l'éditeur. Le contenu passe par le schéma TipTap : aucun HTML venu du
 * fichier n'est injecté.
 */
export function PageView({ corps }: PageViewProps) {
  const contenu = useMemo(() => lireMarkdown(corps).document.toJSON() as object, [corps]);
  const editeur = useEditor(
    {
      extensions: extensionsDuSchema,
      content: contenu,
      editable: false,
      editorProps: { attributes: { class: classeDePage } },
    },
    [contenu],
  );
  return <EditorContent editor={editeur} />;
}
