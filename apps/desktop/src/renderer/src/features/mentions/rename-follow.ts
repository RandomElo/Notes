import { indexerTitres } from '@notes/core';
import type { VaultOperationResult } from '../../../../shared/ipc-contract';
import { api } from '../../lib/ipc';

/** La page ouverte dans l'éditeur, et ce qu'elle fait quand une page qu'elle mentionne change de titre. */
interface EditeurOuvert {
  id: string;
  suivre: (idRenomme: string, titre: string) => void;
}

let ouvert: EditeurOuvert | null = null;

/** L'éditeur de la page « id » s'inscrit tant qu'il est affiché. Rend la désinscription. */
export function inscrireEditeurOuvert(id: string, suivre: EditeurOuvert['suivre']): () => void {
  const inscrit = { id, suivre };
  ouvert = inscrit;
  return () => {
    if (ouvert === inscrit) {
      ouvert = null;
    }
  };
}

/**
 * Renomme une page (docs/spec/editeur.md). Le main réécrit ses mentions dans les autres
 * pages, sauf dans la page ouverte : écrire son fichier ferait un conflit avec
 * la frappe en cours. C'est son éditeur qui change ses mentions, et elles
 * partent avec l'enregistrement suivant.
 */
export async function renommerEnSuivantLesMentions(chemin: string, titre: string): Promise<VaultOperationResult> {
  const editeur = ouvert;
  const resultat = await api.renommerPage({ chemin, titre, ...(editeur === null ? {} : { sauf: editeur.id }) });
  if (resultat.ok && editeur !== null) {
    const nouveau = indexerTitres(resultat.arbre).get(resultat.page.id)?.titre;
    if (nouveau !== undefined) {
      editeur.suivre(resultat.page.id, nouveau);
    }
  }
  return resultat;
}
