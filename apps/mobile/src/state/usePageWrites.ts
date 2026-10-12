import { modifierCorps } from '@notes/document';
import type { Transform } from '@tiptap/pm/transform';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNotes } from './NotesContext';

export interface PageWrites {
  /** Le corps à afficher : celui du cache, avec les modifications pas encore confirmées par le NAS. */
  corps: string | null;
  /**
   * Applique une opération tout de suite à l'écran, puis l'écrit sur le NAS
   * en arrière-plan, après celles d'avant. Faux si elle ne change rien.
   */
  appliquer: (operation: (tr: Transform) => unknown) => boolean;
  /** Remplace tout le corps (bloc retouché dans l'éditeur). Faux si rien ne change. */
  remplacer: (nouveau: string) => boolean;
}

/**
 * Modifications d'une page sur le téléphone, affichées avant d'être écrites
 * (choix d'Eloi du 2026-10-10). Rien n'est gardé sur le téléphone : chaque
 * modification part aussitôt sur le NAS, sous verrou, dans l'ordre, et le
 * cache n'est mis à jour qu'une fois le NAS écrit (README §5). Chaque écriture
 * remplace le corps qu'elle a vu par le nouveau : si le NAS a autre chose
 * (page changée sur le PC), elle est refusée, l'écran revient à la version du
 * NAS et les modifications suivantes, préparées sur la version refusée, sont
 * abandonnées.
 */
export function usePageWrites(page: string | null, corpsDuCache: string | null, modeListe: boolean): PageWrites {
  const { modifierPage } = useNotes();
  const [affiche, definirAffiche] = useState<string | null>(null);
  const courant = useRef<string | null>(null);
  const file = useRef<Promise<unknown>>(Promise.resolve());
  const enAttente = useRef(0);
  /** Change à chaque échec : les écritures déjà en file, préparées sur une version abandonnée, ne partent pas. */
  const generation = useRef(0);

  // Le cache a la version du NAS : sans écriture en cours, c'est elle qu'on montre.
  useEffect(() => {
    if (enAttente.current === 0) {
      courant.current = null;
      definirAffiche(null);
    }
  }, [corpsDuCache]);

  const corps = affiche ?? corpsDuCache;

  const remplacer = useCallback(
    (nouveau: string) => {
      const avant = courant.current ?? corpsDuCache;
      if (page === null || avant === null || nouveau === avant) {
        return false;
      }
      courant.current = nouveau;
      definirAffiche(nouveau);
      enAttente.current += 1;
      const maGeneration = generation.current;
      file.current = file.current.then(async () => {
        try {
          if (maGeneration !== generation.current) {
            return;
          }
          const fait = await modifierPage(page, { corpsAttendu: avant, operation: () => nouveau });
          if (!fait) {
            generation.current += 1;
            courant.current = null;
            definirAffiche(null);
          }
        } finally {
          // Tout écrit : l'affichage garde sa version jusqu'à ce que le cache, relu, l'ait aussi (voir l'effet plus haut).
          enAttente.current -= 1;
        }
      });
      return true;
    },
    [page, corpsDuCache, modifierPage],
  );

  const appliquer = useCallback(
    (operation: (tr: Transform) => unknown) => {
      const avant = courant.current ?? corpsDuCache;
      if (avant === null) {
        return false;
      }
      const nouveau = modifierCorps(avant, operation, modeListe);
      return nouveau !== null && remplacer(nouveau);
    },
    [corpsDuCache, modeListe, remplacer],
  );

  return { corps, appliquer, remplacer };
}
