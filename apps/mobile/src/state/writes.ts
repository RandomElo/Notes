import { LocalFsError, RemoteFsError, VaultError } from '@notes/core';
import type { DirectWriteResult } from '@notes/core';

/*
 * Messages des modifications faites sur le téléphone (docs/spec/android.md). Rien
 * n'est gardé pour plus tard : un refus dit pourquoi, et la page reste
 * comme sur le NAS.
 */

export const messageHorsReseau = 'Le NAS ne répond pas : rien n’a été modifié.';

/** Pourquoi une écriture a été refusée. null si elle est passée. */
export function messageDuResultat(resultat: DirectWriteResult): string | null {
  if (resultat.ok) {
    return null;
  }
  switch (resultat.raison) {
    case 'verrou':
      return `${resultat.nom === '' ? 'Un autre appareil' : `« ${resultat.nom} »`} modifie cette page en ce moment. Réessaie quand il l’aura quittée.`;
    case 'changee':
      return 'La page venait de changer sur le NAS : la voici à jour, recommence.';
    case 'introuvable':
      return 'Cette page n’est plus sur le NAS.';
  }
}

/** Message d'une erreur levée pendant une écriture. */
export function messageDErreur(erreur: unknown): string {
  if (erreur instanceof VaultError) {
    return erreur.message;
  }
  if (erreur instanceof LocalFsError) {
    return `Stockage du téléphone : ${erreur.message}`;
  }
  if (erreur instanceof RemoteFsError && erreur.code !== 'injoignable' && erreur.code !== 'non_connecte') {
    return `Le NAS a refusé la modification : ${erreur.message}`;
  }
  return messageHorsReseau;
}
