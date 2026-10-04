import { useCallback, useState } from 'react';

/**
 * État gardé d'un lancement à l'autre dans le stockage local de la fenêtre.
 * Réservé aux préférences d'affichage (éléments dépliés, page ouverte) : rien
 * qui touche au contenu des notes.
 */
export function useStoredState<T>(cle: string, defaut: T, valider: (valeur: unknown) => valeur is T) {
  const [valeur, definirValeur] = useState<T>(() => {
    try {
      const lu: unknown = JSON.parse(window.localStorage.getItem(cle) ?? 'null');
      return valider(lu) ? lu : defaut;
    } catch {
      return defaut;
    }
  });

  const definir = useCallback(
    (suivante: T | ((precedente: T) => T)) => {
      definirValeur((precedente) => {
        const calculee = typeof suivante === 'function' ? (suivante as (precedente: T) => T)(precedente) : suivante;
        try {
          window.localStorage.setItem(cle, JSON.stringify(calculee));
        } catch {
          // Stockage indisponible : la préférence ne sera simplement pas retenue.
        }
        return calculee;
      });
    },
    [cle],
  );

  return [valeur, definir] as const;
}

export const estTexteOuNull = (valeur: unknown): valeur is string | null => valeur === null || typeof valeur === 'string';
export const estListeDeTextes = (valeur: unknown): valeur is string[] =>
  Array.isArray(valeur) && valeur.every((element) => typeof element === 'string');
export const estBooleen = (valeur: unknown): valeur is boolean => typeof valeur === 'boolean';
