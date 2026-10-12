import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNotes } from './NotesContext';

const typesParExtension: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
};

function typeDuFichier(chemin: string): string {
  return typesParExtension[chemin.slice(chemin.lastIndexOf('.') + 1).toLowerCase()] ?? 'application/octet-stream';
}

/** Adresses des fichiers du cache, et ceux qui n'ont pas pu être lus (ni dans le cache, ni sur le NAS). */
export interface FichiersDuCache {
  adresse: (chemin: string) => string | null;
  echoue: (chemin: string) => boolean;
}

/** Adresses `blob:` des fichiers du vault, voir `useFichiersDuCache`. */
export function useCacheUrls(): (chemin: string) => string | null {
  return useFichiersDuCache().adresse;
}

/**
 * Adresses `blob:` des fichiers du vault à afficher (images, icônes,
 * favicons). Un fichier absent du cache est demandé au NAS ; tant qu'il n'est
 * pas là, l'adresse est null, et `adresse` change d'identité quand il arrive,
 * ce qui redessine la page. Les adresses sont libérées en quittant l'écran.
 */
export function useFichiersDuCache(): FichiersDuCache {
  const { lireFichier, versionDuCache, etat } = useNotes();
  const [adresses, definirAdresses] = useState<ReadonlyMap<string, string | null>>(new Map());
  const demandes = useRef(new Set<string>());
  const creees = useRef<string[]>([]);

  // Après une sync, une image changée sur le NAS a été retirée du cache : on la redemande.
  useEffect(() => {
    demandes.current.clear();
    definirAdresses((avant) => (avant.size === 0 ? avant : new Map()));
  }, [versionDuCache]);

  // Le NAS répond de nouveau : ce qui n'avait pas pu être téléchargé est redemandé.
  useEffect(() => {
    if (etat.genre !== 'a-jour') {
      return;
    }
    definirAdresses((avant) => {
      const echecs = [...avant].filter(([, adresse]) => adresse === null).map(([chemin]) => chemin);
      if (echecs.length === 0) {
        return avant;
      }
      echecs.forEach((chemin) => demandes.current.delete(chemin));
      const suivantes = new Map(avant);
      echecs.forEach((chemin) => suivantes.delete(chemin));
      return suivantes;
    });
  }, [etat.genre]);

  useEffect(
    () => () => {
      creees.current.forEach((adresse) => URL.revokeObjectURL(adresse));
    },
    [],
  );

  const adresse = useCallback(
    (chemin: string) => {
      const connue = adresses.get(chemin);
      if (connue !== undefined) {
        return connue;
      }
      if (!demandes.current.has(chemin)) {
        demandes.current.add(chemin);
        lireFichier(chemin).then(
          (octets) => {
            const adresse = URL.createObjectURL(new Blob([octets as Uint8Array<ArrayBuffer>], { type: typeDuFichier(chemin) }));
            creees.current.push(adresse);
            definirAdresses((avant) => new Map(avant).set(chemin, adresse));
          },
          () => definirAdresses((avant) => new Map(avant).set(chemin, null)),
        );
      }
      return null;
    },
    [adresses, lireFichier],
  );
  const echoue = useCallback((chemin: string) => adresses.get(chemin) === null, [adresses]);
  return useMemo(() => ({ adresse, echoue }), [adresse, echoue]);
}
