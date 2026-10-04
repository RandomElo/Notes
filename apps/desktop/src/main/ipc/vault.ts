import { renommerMentions } from '@notes/document';
import { LocalFsError, VaultError, ajouterIconeImage, changerIcone, chargerPage, mentionsCassees, pagesQuiMentionnent, reecrireCorps, creerPage, lireConflit, listerConflits, resoudreConflit, deplacerPage, deplacerPages, dupliquerPage, supprimerPageVide, enregistrerCorps, importer, lireArbre, lireContenu, renommerPage, verifierCheminRelatif } from '@notes/core';
import type { BrokenMention, PageLocation, TreeNode, VaultContext } from '@notes/core';
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
      const { chemin, titre, sauf } = champs(demande);
      if (!estChemin(chemin) || typeof titre !== 'string' || !(sauf === undefined || typeof sauf === 'string')) {
        return Promise.resolve(requeteInvalide());
      }
      return operation(async (contexte) => {
        const avant = (await chargerPage(contexte.fs, chemin)).meta.titre;
        const page = await renommerPage(contexte, chemin, titre);
        const apres = (await chargerPage(contexte.fs, page.chemin)).meta.titre;
        if (apres !== avant) {
          await suivreLeRenommage(contexte, page.id, apres, sauf);
        }
        return page;
      });
    },

    changerIcone: (demande: unknown) => {
      const { chemin, icone } = champs(demande);
      if (!estChemin(chemin) || !(icone === null || (typeof icone === 'string' && icone.length <= 200))) {
        return Promise.resolve(requeteInvalide());
      }
      return operation((contexte) => changerIcone(contexte, chemin, icone));
    },

    ajouterIconeImage: (demande: unknown) => {
      const { chemin, octets } = champs(demande);
      // Une icône fait 128 × 128 : quelques dizaines de kilo-octets suffisent largement.
      if (!estChemin(chemin) || !(octets instanceof Uint8Array) || octets.length > 2 * 1024 * 1024) {
        return Promise.resolve(requeteInvalide());
      }
      return operation((contexte) => ajouterIconeImage(contexte, chemin, octets));
    },

    listerMentionsCassees: (): Promise<BrokenMention[]> =>
      enSerie(async () => {
        const { fs } = vault.contexte();
        return mentionsCassees(fs, await lireArbre(fs)).catch(() => []);
      }),

    deplacerPage: (demande: unknown) => {
      const { chemin, parent, index } = champs(demande);
      if (!estChemin(chemin) || !estParent(parent) || !estIndex(index)) {
        return Promise.resolve(requeteInvalide());
      }
      return operation((contexte) => deplacerPage(contexte, chemin, { parent, ...(index === undefined ? {} : { index }) }));
    },

    deplacerPages: (demande: unknown) => {
      const { chemins, parent, index } = champs(demande);
      if (!Array.isArray(chemins) || chemins.length === 0 || chemins.length > 500 || !chemins.every(estChemin) || !estParent(parent) || !estIndex(index)) {
        return Promise.resolve(requeteInvalide());
      }
      return enSerie(async () => {
        try {
          const contexte = vault.contexte();
          const pages = await deplacerPages(contexte, chemins, { parent, ...(index === undefined ? {} : { index }) });
          return { ok: true as const, page: pages[0] ?? { chemin: parent, id: '' }, arbre: await lireArbre(contexte.fs) };
        } catch (erreur) {
          return { ok: false as const, erreur: versErreur(erreur) };
        }
      });
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

/**
 * Une page renommée : ses mentions prennent le nouveau titre dans les pages qui
 * la citent (README §6), pour que les fichiers restent justes hors de
 * l'application. La page « sauf », ouverte dans l'éditeur, s'en charge
 * elle-même : l'écrire ici ferait un conflit avec la frappe en cours. Une page
 * qui ne peut pas être réécrite n'empêche pas le renommage.
 */
async function suivreLeRenommage(contexte: VaultContext, id: string, titre: string, sauf: string | undefined): Promise<void> {
  const arbre = await lireArbre(contexte.fs);
  for (const chemin of await pagesQuiMentionnent(contexte.fs, arbre, id)) {
    try {
      if ((await chargerPage(contexte.fs, chemin)).meta.id !== sauf) {
        await reecrireCorps(contexte, chemin, (corps) => renommerMentions(corps, id, titre));
      }
    } catch (erreur) {
      console.error(`Mentions de ${chemin} non mises à jour :`, erreur instanceof Error ? erreur.message : erreur);
    }
  }
}

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
