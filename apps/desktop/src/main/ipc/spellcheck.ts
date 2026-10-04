import { ajouterAuDictionnaire, lireDictionnaire } from '@notes/core';
import type { SpellcheckState, SpellIssue } from '../../shared/ipc-contract';
import { verifierDemande, verifierTexte } from '../languagetool/client';
import type { SpellcheckService } from '../languagetool/spellcheck-service';
import type { VaultService } from '../vault/vault-service';
import { champs } from './vault';

export interface SpellcheckHandlersDependencies {
  correction: Pick<SpellcheckService, 'etat' | 'installer' | 'annulerInstallation' | 'desinstaller' | 'relancer' | 'adresse'>;
  vault: VaultService;
  /** File des opérations sur le vault (ipc/vault.ts) : le dictionnaire est un fichier du dossier des notes, synchronisé. */
  enSerie: <T>(tache: () => Promise<T>) => Promise<T>;
  /** Vérification d'un texte par le serveur (languagetool/client.ts), remplaçable dans les tests. */
  verifier?: typeof verifierTexte;
}

/** Handlers des canaux « correction: ». Les entrées viennent du renderer : rien n'est supposé valide. */
export function creerHandlersCorrection({ correction, vault, enSerie, verifier = verifierTexte }: SpellcheckHandlersDependencies) {
  const lire = async (): Promise<string[]> => {
    try {
      return await lireDictionnaire(vault.contexte());
    } catch {
      // Pas de dossier des notes, ou fichier illisible : la correction marche sans dictionnaire.
      return [];
    }
  };

  return {
    etat: (): SpellcheckState => correction.etat(),
    installer: (): SpellcheckState => correction.installer(),
    annuler: (): void => correction.annulerInstallation(),
    desinstaller: (): Promise<SpellcheckState> => correction.desinstaller(),
    relancer: (): SpellcheckState => correction.relancer(),

    /** null quand la correction n'est pas prête ou ne répond pas : le renderer ne souligne rien, l'édition continue. */
    verifier: async (recu: unknown): Promise<SpellIssue[] | null> => {
      const demande = verifierDemande(recu);
      const adresse = correction.adresse();
      if (demande === null || adresse === null) {
        return null;
      }
      return verifier(adresse, demande);
    },

    lireDictionnaire: (): Promise<string[]> => enSerie(lire),

    ajouterAuDictionnaire: (demande: unknown): Promise<string[]> => {
      const { mot } = champs(demande);
      if (typeof mot !== 'string') {
        return enSerie(lire);
      }
      return enSerie(async () => {
        try {
          return await ajouterAuDictionnaire(vault.contexte(), mot);
        } catch {
          return lire();
        }
      });
    },
  };
}
