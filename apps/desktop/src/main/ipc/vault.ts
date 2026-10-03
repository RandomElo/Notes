import { LocalFsError, VaultError, creerPage, lireConflit, listerConflits, resoudreConflit, deplacerPage, dupliquerPage, supprimerPageVide, enregistrerCorps, importer, lireArbre, lireContenu, renommerPage, verifierCheminRelatif } from '@notes/core';
import type { PageLocation, TreeNode, VaultContext } from '@notes/core';
import type { ConflictReadResult, PageReadResult, PageSaveResult, VaultFailure, VaultOperationResult, VaultState } from '../../shared/ipc-contract';
import { creerFileDAttente } from '../vault/serial-queue';
import type { SerialQueue } from '../vault/serial-queue';
import type { VaultService } from '../vault/vault-service';

export interface VaultHandlersDependencies {
  vault: VaultService;
  /** Ouvre le sélecteur de dossier du système. null si l'utilisateur annule. */
  choisirDossier: () => Promise<string | null>;
  /** File partagée avec la sync. Par défaut, une file propre à ces handlers. */
  file?: SerialQueue;
}

/** Handlers des canaux « vault: ». Les entrées viennent du renderer : rien n'est supposé valide. */
export function creerHandlersVault({ vault, choisirDossier, file = creerFileDAttente() }: VaultHandlersDependencies) {
  // Les opérations s'exécutent une par une : deux déplacements simultanés se marcheraient dessus.
  const { enSerie } = file;

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

    supprimerPageVide: (demande: unknown) => {
      const { chemin } = champs(demande);
      return estChemin(chemin) ? operation((contexte) => supprimerPageVide(contexte, chemin)) : Promise.resolve(requeteInvalide());
    },

    importer: (demande: unknown) => {
      const { chemin } = champs(demande);
      return estChemin(chemin) ? operation((contexte) => importer(contexte, chemin)) : Promise.resolve(requeteInvalide());
    },

    lirePage: (demande: unknown): Promise<PageReadResult> => {
      const { chemin } = champs(demande);
      if (!estChemin(chemin)) {
        return Promise.resolve(requeteInvalide());
      }
      return enSerie(async () => {
        try {
          return { ok: true, ...(await lireContenu(vault.contexte().fs, chemin)) };
        } catch (erreur) {
          return { ok: false, erreur: versErreur(erreur) };
        }
      });
    },

    enregistrerPage: (demande: unknown): Promise<PageSaveResult> => {
      const { chemin, corps, corpsDeBase } = champs(demande);
      if (!estChemin(chemin) || !estCorps(corps) || !estCorps(corpsDeBase)) {
        return Promise.resolve(requeteInvalide());
      }
      return enSerie(async () => {
        try {
          return { ok: true, ...(await enregistrerCorps(vault.contexte(), chemin, { corps, corpsDeBase })) };
        } catch (erreur) {
          return { ok: false, erreur: versErreur(erreur) };
        }
      });
    },

    listerConflits: (demande: unknown): Promise<string[]> => {
      const { chemin } = champs(demande);
      if (!estChemin(chemin)) {
        return Promise.resolve([]);
      }
      return enSerie(async () => listerConflits(vault.contexte().fs, chemin).catch(() => []));
    },

    lireConflit: (demande: unknown): Promise<ConflictReadResult> => {
      const { sauvegarde } = champs(demande);
      if (!estChemin(sauvegarde)) {
        return Promise.resolve(requeteInvalide());
      }
      return enSerie(async () => {
        try {
          return { ok: true, ...(await lireConflit(vault.contexte().fs, sauvegarde)) };
        } catch (erreur) {
          return { ok: false, erreur: versErreur(erreur) };
        }
      });
    },

    resoudreConflit: (demande: unknown): Promise<PageSaveResult> => {
      const { sauvegarde, corps, corpsDeBase } = champs(demande);
      if (!estChemin(sauvegarde) || !estCorps(corps) || !estCorps(corpsDeBase)) {
        return Promise.resolve(requeteInvalide());
      }
      return enSerie(async () => {
        try {
          return { ok: true, ...(await resoudreConflit(vault.contexte(), sauvegarde, { corps, corpsDeBase })) };
        } catch (erreur) {
          return { ok: false, erreur: versErreur(erreur) };
        }
      });
    },

    /** Exécute une tâche à la suite des opérations sur le vault : les images s'ajoutent aussi une par une. */
    enSerie,

    /** Se termine quand toutes les opérations déjà demandées sont finies. Sert à ne pas quitter au milieu d'une écriture. */
    attendre: file.attendre,
  };
}

type EchecOuEtat = VaultState | VaultFailure;

/** Taille maximale d'un corps de page accepté du renderer : bien au-delà d'une note, bien en deçà d'un abus. */
const tailleMaxDuCorps = 20_000_000;

function estCorps(valeur: unknown): valeur is string {
  return typeof valeur === 'string' && valeur.length <= tailleMaxDuCorps;
}

async function definir(vault: VaultService, dossier: string): Promise<EchecOuEtat> {
  try {
    return await vault.definirDossier(dossier);
  } catch (erreur) {
    return { ok: false, erreur: versErreur(erreur) };
  }
}

export function champs(demande: unknown): Record<string, unknown> {
  return typeof demande === 'object' && demande !== null ? (demande as Record<string, unknown>) : {};
}

export function estChemin(valeur: unknown): valeur is string {
  return typeof valeur === 'string' && verifierCheminRelatif(valeur) === null;
}

/** Un parent est un chemin valide, ou la chaîne vide pour la racine du vault. */
function estParent(valeur: unknown): valeur is string {
  return valeur === '' || estChemin(valeur);
}

function estIndex(valeur: unknown): valeur is number | undefined {
  return valeur === undefined || (typeof valeur === 'number' && Number.isInteger(valeur) && valeur >= 0 && valeur < 1_000_000);
}

export function requeteInvalide(): VaultFailure {
  return { ok: false, erreur: { code: 'requete_invalide', message: 'Demande invalide.' } };
}

export function versErreur(erreur: unknown): VaultFailure['erreur'] {
  if (erreur instanceof VaultError || erreur instanceof LocalFsError) {
    return { code: erreur.code, message: erreur.message };
  }
  return { code: 'interne', message: 'Erreur inattendue.' };
}
