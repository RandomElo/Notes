import { useEffect, useState } from 'react';
import { api } from '../../lib/ipc';

/** Délai après un changement du dossier ou de la sync : une rafale ne déclenche qu'une lecture. */
const delaiMs = 300;

/**
 * Parmi ces pages, celles que le NAS n'a pas encore dans leur dernière
 * version, relues quand la sync change d'état ou que le dossier des notes est
 * modifié. Rien quand la sync n'est pas réglée.
 */
export function usePendingPages(chemins: readonly string[]): ReadonlySet<string> {
  const [enAttente, definirEnAttente] = useState<ReadonlySet<string>>(new Set());
  const cle = JSON.stringify(chemins);

  useEffect(() => {
    const liste = JSON.parse(cle) as string[];
    let actif = true;
    let minuteur: ReturnType<typeof setTimeout> | null = null;
    const relire = (): void => {
      void api.pagesEnAttente({ chemins: liste }).then((pages) => {
        if (actif) {
          definirEnAttente((precedent) => (precedent.size === pages.length && pages.every((page) => precedent.has(page)) ? precedent : new Set(pages)));
        }
      });
    };
    const plusTard = (): void => {
      if (minuteur !== null) {
        clearTimeout(minuteur);
      }
      minuteur = setTimeout(relire, delaiMs);
    };
    relire();
    const desabonnements = [api.surEtatSync(plusTard), api.surVaultModifie(plusTard)];
    return () => {
      actif = false;
      if (minuteur !== null) {
        clearTimeout(minuteur);
      }
      desabonnements.forEach((desabonner) => desabonner());
    };
  }, [cle]);

  return enAttente;
}
