import type { LocalFs } from '../fs/local-fs';
import { dossierParent, joindreChemins, nomDeBase } from '../fs/paths';
import { estFichierDeConflit } from '../page/conflict';
import { analyserPage } from '../page/page-file';
import { enregistrerCorps } from './content';
import type { SaveResult } from './content';
import { VaultError } from './context';
import type { VaultContext } from './context';
import { chargerPage } from './operations';

/**
 * Les versions d'une page mises de côté (`page.conflit-[date].md`, docs/spec/sync.md)
 * et leur résolution : la page reçoit le résultat choisi, puis la sauvegarde
 * est supprimée. Rien n'est supprimé avant que la page soit écrite.
 */

/** Sauvegardes de conflit de la page, la plus ancienne en premier. */
export async function listerConflits(fs: LocalFs, page: string): Promise<string[]> {
  if (page === '' || (await fs.infos(page))?.estDossier !== true) {
    return [];
  }
  return (await fs.lister(page))
    .filter((entree) => !entree.estDossier && estFichierDeConflit(entree.nom))
    .map((entree) => joindreChemins(page, entree.nom))
    .sort();
}

export interface ConflictVersions {
  /** Dossier de la page. */
  page: string;
  /** Corps de la page (A) et de la version mise de côté (B). */
  corpsPage: string;
  corpsSauvegarde: string;
  /** Date de modification inscrite dans chaque version, null si elle manque. */
  modifieLePage: string | null;
  modifieLeSauvegarde: string | null;
}

/** Lit les deux versions. Refuse ce qui n'est pas une sauvegarde de conflit d'une page. */
export async function lireConflit(fs: LocalFs, sauvegarde: string): Promise<ConflictVersions> {
  const page = verifierSauvegarde(sauvegarde);
  if ((await fs.infos(sauvegarde)) === null) {
    throw new VaultError('introuvable', 'Cette version en conflit a déjà été résolue ou supprimée.');
  }
  const { texte, meta } = await chargerPage(fs, page);
  const autre = analyserPage(await fs.lireTexte(sauvegarde));
  return {
    page,
    corpsPage: analyserPage(texte).corps,
    corpsSauvegarde: autre.corps,
    modifieLePage: meta.modifieLe === '' ? null : meta.modifieLe,
    modifieLeSauvegarde: autre.meta?.modifieLe ?? null,
  };
}

/**
 * Enregistre le corps choisi dans la page, puis supprime la sauvegarde. Si la
 * page a changé depuis sa lecture, sa version du disque est d'abord gardée
 * à son tour (comme pour tout enregistrement) : rien n'est perdu.
 */
export async function resoudreConflit(contexte: VaultContext, sauvegarde: string, demande: { corps: string; corpsDeBase: string }): Promise<SaveResult> {
  const page = verifierSauvegarde(sauvegarde);
  if ((await contexte.fs.infos(sauvegarde)) === null) {
    throw new VaultError('introuvable', 'Cette version en conflit a déjà été résolue ou supprimée.');
  }
  const resultat = await enregistrerCorps(contexte, page, demande);
  await contexte.fs.supprimer(sauvegarde);
  return resultat;
}

/** Vrai pour la version en conflit d'une page (`Page/page.conflit-[date].md`), que l'écran de résolution sait ouvrir. */
export function estFichierDeConflitDePage(chemin: string): boolean {
  return dossierParent(chemin) !== '' && estFichierDeConflit(nomDeBase(chemin));
}

function verifierSauvegarde(sauvegarde: string): string {
  const page = dossierParent(sauvegarde);
  if (!estFichierDeConflitDePage(sauvegarde)) {
    throw new VaultError('introuvable', "Ce fichier n'est pas une version en conflit d'une page.");
  }
  return page;
}
