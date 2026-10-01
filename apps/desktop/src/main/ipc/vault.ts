import { LocalFsError, VaultError, creerPage, deplacerPage, dupliquerPage, importer, lireArbre, renommerPage, verifierCheminRelatif } from '@notes/core';
import type { PageLocation, TreeNode, VaultContext } from '@notes/core';
import type { VaultOperationResult, VaultState } from '../../shared/ipc-contract';
import type { VaultService } from '../vault/vault-service';

export interface VaultHandlersDependencies {
  vault: VaultService;
  /** Ouvre le sélecteur de dossier du système. null si l'utilisateur annule. */
  choisirDossier: () => Promise<string | null>;
}

/** Handlers des canaux « vault: ». Les entrées viennent du renderer : rien n'est supposé valide. */
export function creerHandlersVault({ vault, choisirDossier }: VaultHandlersDependencies) {
  // Les opérations s'exécutent une par une : deux déplacements simultanés se marcheraient dessus.
  let file: Promise<unknown> = Promise.resolve();
  const enSerie = <T>(tache: () => Promise<T>): Promise<T> => {
    const resultat = file.then(tache, tache);
    file = resultat.catch(() => undefined);
    return resultat;
  };

  const operation = (action: (contexte: VaultContext) => Promise<PageLocation>): Promise<VaultOperationResult> =>
    enSerie(async () => {
      try {
        const contexte = vault.contexte();
        const page = await action(contexte);
        return { ok: true, page, arbre: await lireArbre(contexte.fs) };
      } catch (erreur) {
        return { ok: false, erreur: versErreur(erreur) };
      }
    });

  return {
    etat: async (): Promise<VaultState> => vault.etat(),

    choisirDossier: async (): Promise<EchecOuEtat> => {
      const choisi = await choisirDossier();
      return choisi === null ? vault.etat() : definir(vault, choisi);
    },

    utiliserDossierPropose: async (): Promise<EchecOuEtat> =>
      definir(vault, vault.etat().dossierPropose),

    lireArbre: (): Promise<TreeNode[]> => enSerie(async () => lireArbre(vault.contexte().fs)),

    creerPage: (demande: unknown) => {
      const { parent, titre, index } = champs(demande);
      if (!estParent(parent) || typeof titre !== 'string' || !estIndex(index)) {
        return Promise.resolve(requeteInvalide());
      }
      return operation((contexte) => creerPage(contexte, { parent, titre, ...(index === undefined ? {} : { index }) }));
    },

    renommerPage: (demande: unknown) => {
      const { chemin, titre } = champs(demande);
      if (!estChemin(chemin) || typeof titre !== 'string') {
        return Promise.resolve(requeteInvalide());
      }
      return operation((contexte) => renommerPage(contexte, chemin, titre));
    },

    deplacerPage: (demande: unknown) => {
      const { chemin, parent, index } = champs(demande);
      if (!estChemin(chemin) || !estParent(parent) || !estIndex(index)) {
        return Promise.resolve(requeteInvalide());
      }
      return operation((contexte) => deplacerPage(contexte, chemin, { parent, ...(index === undefined ? {} : { index }) }));
    },

    dupliquerPage: (demande: unknown) => {
      const { chemin } = champs(demande);
      return estChemin(chemin) ? operation((contexte) => dupliquerPage(contexte, chemin)) : Promise.resolve(requeteInvalide());
    },

    importer: (demande: unknown) => {
      const { chemin } = champs(demande);
      return estChemin(chemin) ? operation((contexte) => importer(contexte, chemin)) : Promise.resolve(requeteInvalide());
    },
  };
}

type EchecOuEtat = VaultState | Extract<VaultOperationResult, { ok: false }>;

async function definir(vault: VaultService, dossier: string): Promise<EchecOuEtat> {
  try {
    return await vault.definirDossier(dossier);
  } catch (erreur) {
    return { ok: false, erreur: versErreur(erreur) };
  }
}

function champs(demande: unknown): Record<string, unknown> {
  return typeof demande === 'object' && demande !== null ? (demande as Record<string, unknown>) : {};
}

function estChemin(valeur: unknown): valeur is string {
  return typeof valeur === 'string' && verifierCheminRelatif(valeur) === null;
}

/** Un parent est un chemin valide, ou la chaîne vide pour la racine du vault. */
function estParent(valeur: unknown): valeur is string {
  return valeur === '' || estChemin(valeur);
}

function estIndex(valeur: unknown): valeur is number | undefined {
  return valeur === undefined || (typeof valeur === 'number' && Number.isInteger(valeur) && valeur >= 0 && valeur < 1_000_000);
}

function requeteInvalide(): Extract<VaultOperationResult, { ok: false }> {
  return { ok: false, erreur: { code: 'requete_invalide', message: 'Demande invalide.' } };
}

function versErreur(erreur: unknown): Extract<VaultOperationResult, { ok: false }>['erreur'] {
  if (erreur instanceof VaultError || erreur instanceof LocalFsError) {
    return { code: erreur.code, message: erreur.message };
  }
  return { code: 'interne', message: 'Erreur inattendue.' };
}
