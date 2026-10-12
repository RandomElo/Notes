import { RemoteFsError, versCodeErreur } from '@notes/core';
import type { RemoteEntry, RemoteFs } from '@notes/core';
import { depuisBase64, versBase64 } from './base64';
import { Smb } from './plugins';

/** `RemoteFs` par le plugin SMB natif. Chemins relatifs à la racine du partage. */
export const smbRemoteFs: RemoteFs = {
  infos: (chemin) => appel(async () => (await Smb.infos({ chemin })).entree),
  lister: (chemin) => appel(async () => (await Smb.lister({ chemin })).entrees),
  lire: (chemin) => appel(async () => depuisBase64((await Smb.lire({ chemin })).donnees)),
  ecrire: (chemin, contenu) => appel(() => Smb.ecrire({ chemin, donnees: versBase64(contenu) })),
  creerDossier: (chemin) => appel(() => Smb.creerDossier({ chemin })),
  renommer: (chemin, vers) => appel(() => Smb.renommer({ chemin, vers })),
  supprimer: (chemin) => appel(() => Smb.supprimer({ chemin })),
};

/** Une erreur du plugin devient une `RemoteFsError` au code connu. */
export async function appel<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (erreur) {
    throw versErreurDistante(erreur);
  }
}

export function versErreurDistante(erreur: unknown): RemoteFsError {
  if (erreur instanceof RemoteFsError) {
    return erreur;
  }
  const { code, message } = (erreur ?? {}) as { code?: unknown; message?: unknown };
  return new RemoteFsError(versCodeErreur(code), typeof message === 'string' ? message : 'Erreur du NAS.');
}

export type { RemoteEntry };
