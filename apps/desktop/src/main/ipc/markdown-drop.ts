import { lireArbre } from '@notes/core';
import type { MarkdownDropResult } from '../../shared/ipc-contract';
import { creerPageDepuisMarkdown, estUnFichierMarkdown, markdownAAjouter } from '../vault/dropped-markdown';
import type { VaultService } from '../vault/vault-service';
import { champs, estChemin, requeteInvalide, versErreur } from './vault';

export interface MarkdownDropHandlersDependencies {
  vault: VaultService;
  /** File des opérations sur le vault (ipc/vault.ts). */
  enSerie: <T>(tache: () => Promise<T>) => Promise<T>;
}

/** Au plus ce nombre de fichiers déposés d'un coup. */
const maxFichiers = 100;

function estListeDeFichiers(valeur: unknown): valeur is string[] {
  return Array.isArray(valeur) && valeur.length > 0 && valeur.length <= maxFichiers && valeur.every((fichier) => typeof fichier === 'string' && fichier.length < 4096 && estUnFichierMarkdown(fichier));
}

/**
 * Fichiers Markdown déposés dans la fenêtre (docs/spec/interface.md). Les
 * chemins viennent du renderer, qui les tient du glisser-déposer : ils sont
 * vérifiés (absolus, `.md`), et rien n'est lu d'autre que ces fichiers et
 * les images de leur dossier.
 */
export function creerHandlersDepotMarkdown({ vault, enSerie }: MarkdownDropHandlersDependencies) {
  return {
    /** Une sous-page de « parent » par fichier (vide : la racine). */
    creerPages: (demande: unknown): Promise<MarkdownDropResult> => {
      const { fichiers, parent } = champs(demande);
      if (!estListeDeFichiers(fichiers) || (parent !== '' && !estChemin(parent))) {
        return Promise.resolve(requeteInvalide());
      }
      return enSerie(async () => {
        try {
          const contexte = vault.contexte();
          const pages = [];
          for (const fichier of fichiers) {
            pages.push(await creerPageDepuisMarkdown(contexte, fichier, parent as string));
          }
          return { ok: true, pages, arbre: await lireArbre(contexte.fs), markdown: '' };
        } catch (erreur) {
          return { ok: false, erreur: versErreur(erreur) };
        }
      });
    },

    /** Le texte des fichiers, à ajouter à la fin de la page « page » ; leurs images sont déjà copiées dans son dossier. */
    texteAAjouter: (demande: unknown): Promise<MarkdownDropResult> => {
      const { fichiers, page } = champs(demande);
      if (!estListeDeFichiers(fichiers) || !estChemin(page)) {
        return Promise.resolve(requeteInvalide());
      }
      return enSerie(async () => {
        try {
          const contexte = vault.contexte();
          const textes = [];
          for (const fichier of fichiers) {
            textes.push((await markdownAAjouter(contexte, fichier, page)).trim());
          }
          return { ok: true, pages: [], arbre: null, markdown: `${textes.join('\n\n')}\n` };
        } catch (erreur) {
          return { ok: false, erreur: versErreur(erreur) };
        }
      });
    },
  };
}
