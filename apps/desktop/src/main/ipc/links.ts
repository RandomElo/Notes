import { enregistrerFavicon } from '@notes/core';
import type { FaviconSaveResult, SitePreviewResult } from '../../shared/ipc-contract';
import type { VaultService } from '../vault/vault-service';
import { champs, versErreur } from './vault';

export interface LinksHandlersDependencies {
  vault: VaultService;
  /** File des opérations sur le vault (ipc/vault.ts). */
  enSerie: <T>(tache: () => Promise<T>) => Promise<T>;
  /** Titre et favicon d'un site (links/site-preview.ts), hors de la file : le réseau ne bloque pas le vault. */
  apercu: (adresse: string) => Promise<SitePreviewResult>;
}

/** Handlers des canaux « liens: » : mentions de site. Les entrées viennent du renderer : rien n'est supposé valide. */
export function creerHandlersLiens({ vault, enSerie, apercu }: LinksHandlersDependencies) {
  return {
    apercuDuSite: (demande: unknown): Promise<SitePreviewResult> => {
      const { adresse } = champs(demande);
      if (typeof adresse !== 'string' || adresse.length > 4000) {
        return Promise.resolve({ ok: false, message: 'Demande invalide.' });
      }
      return apercu(adresse);
    },

    enregistrerFavicon: (demande: unknown): Promise<FaviconSaveResult> => {
      const { hote, octets } = champs(demande);
      if (typeof hote !== 'string' || !(octets instanceof Uint8Array)) {
        return Promise.resolve({ ok: false, erreur: { code: 'requete_invalide', message: 'Demande invalide.' } });
      }
      return enSerie(async () => {
        try {
          return { ok: true, chemin: await enregistrerFavicon(vault.contexte(), hote, octets) };
        } catch (erreur) {
          return { ok: false, erreur: versErreur(erreur) };
        }
      });
    },
  };
}
