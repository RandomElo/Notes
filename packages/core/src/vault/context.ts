import type { LocalFs } from '../fs/local-fs';

/**
 * Ce dont les opérations sur le vault ont besoin de la plateforme. L'horloge
 * et l'aléa sont injectés : core n'a accès à aucune API système, et les tests
 * peuvent ainsi être déterministes.
 */
export interface VaultContext {
  fs: LocalFs;
  /** Millisecondes depuis l'époque Unix. */
  maintenant(): number;
  /** Octets aléatoires de qualité cryptographique. */
  octetsAleatoires(taille: number): Uint8Array;
}

export type VaultErrorCode =
  | 'introuvable'
  | 'titre_invalide'
  | 'deplacement_invalide'
  | 'non_importee'
  | 'deja_importee'
  | 'chemin_invalide'
  | 'page_non_vide'
  | 'deja_presente';

export class VaultError extends Error {
  readonly code: VaultErrorCode;

  constructor(code: VaultErrorCode, message: string) {
    super(message);
    this.name = 'VaultError';
    this.code = code;
  }
}
