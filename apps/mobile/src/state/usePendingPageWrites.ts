import { modifierCorps } from '@notes/document';
import type { Transform } from '@tiptap/pm/transform';
import { useCallback } from 'react';
import { useNotes } from './NotesContext';
import type { PageWrites } from './usePageWrites';

/**
 * Modifications d'une page créée sans NAS (choix d'Eloi, 2026-10-11) : rien
 * ne part sur le NAS, le contenu attend sur le téléphone avec la page et
 * part avec elle. Même forme que `usePageWrites`, pour que l'éditeur et la
 * liste ne fassent pas la différence. `chemin` null : ce n'est pas une page
 * en attente.
 */
export function usePendingPageWrites(chemin: string | null, modeListe: boolean): PageWrites {
  const { pageEnAttente, ecrireEnAttente } = useNotes();
  const corps = chemin === null ? null : (pageEnAttente(chemin)?.corps ?? null);

  const remplacer = useCallback(
    (nouveau: string) => {
      const avant = chemin === null ? null : (pageEnAttente(chemin)?.corps ?? null);
      if (chemin === null || avant === null || nouveau === avant) {
        return false;
      }
      void ecrireEnAttente(chemin, nouveau);
      return true;
    },
    [chemin, pageEnAttente, ecrireEnAttente],
  );

  const appliquer = useCallback(
    (operation: (tr: Transform) => unknown) => {
      const avant = chemin === null ? null : (pageEnAttente(chemin)?.corps ?? null);
      if (avant === null) {
        return false;
      }
      const nouveau = modifierCorps(avant, operation, modeListe);
      return nouveau !== null && remplacer(nouveau);
    },
    [chemin, pageEnAttente, modeListe, remplacer],
  );

  return { corps, appliquer, remplacer };
}
