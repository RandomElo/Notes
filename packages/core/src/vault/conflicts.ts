import type { LocalFs } from '../fs/local-fs';
import { dossierParent, joindreChemins, nomDeBase } from '../fs/paths';
import { estFichierDeConflit } from '../page/conflict';
import { analyserPage } from '../page/page-file';
import { enregistrerCorps } from './content';
import type { SaveResult } from './content';
import { VaultError } from './context';
import type { VaultContext } from './context';
import { chargerPage } from './operations';
import { lireOrdre } from './order';
import { lireEnfants } from './tree';
import { estId } from '../page/id';

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

/** Vrai pour la sauvegarde de l'ordre des sous-pages d'un dossier (`.order.conflit-[date]`). */
export function estConflitDOrdre(chemin: string): boolean {
  return /^\.order\.conflit-\d{4}-\d{2}-\d{2}-\d{6}(-\d+)?$/.test(nomDeBase(chemin));
}

/**
 * Écarte la sauvegarde d'un ordre de sous-pages en conflit : l'ordre actuel reste. Rien ne s'y
 * perd : une sous-page absente de l'ordre s'affiche quand même, à la fin. La suppression part
 * ensuite sur le NAS par la sync, comme toute suppression.
 */
export async function ecarterConflitDOrdre(contexte: VaultContext, sauvegarde: string): Promise<void> {
  if (!estConflitDOrdre(sauvegarde) || (await contexte.fs.infos(sauvegarde))?.estDossier !== false) {
    throw new VaultError('introuvable', "Cette sauvegarde d'ordre a déjà été écartée.");
  }
  await contexte.fs.supprimer(sauvegarde);
}

/** Une page dans un ordre de sous-pages, avec ce qui la distingue de l'autre version. */
export interface OrderEntry {
  id: string;
  /** Titre de la page, null si elle n'existe plus dans le dossier. */
  titre: string | null;
  /** « seule » : absente de l'autre version ; « deplacee » : présente des deux côtés, pas au même rang parmi les pages communes. */
  difference: 'seule' | 'deplacee' | null;
}

export interface OrderConflict {
  actuel: OrderEntry[];
  ancien: OrderEntry[];
}

/** Les deux ordres comparés : chaque page marquée si elle n'est que d'un côté, ou si elle a changé de rang parmi les pages communes. */
export function comparerOrdres(actuel: readonly string[], ancien: readonly string[], titres: ReadonlyMap<string, string>): OrderConflict {
  const communs = (liste: readonly string[], autre: readonly string[]) => liste.filter((id) => autre.includes(id));
  const communsActuel = communs(actuel, ancien);
  const communsAncien = communs(ancien, actuel);
  const marquer = (liste: readonly string[], autre: readonly string[], miens: string[], siens: string[]): OrderEntry[] =>
    liste.map((id) => ({
      id,
      titre: titres.get(id) ?? null,
      difference: !autre.includes(id) ? 'seule' : miens.indexOf(id) !== siens.indexOf(id) ? 'deplacee' : null,
    }));
  return { actuel: marquer(actuel, ancien, communsActuel, communsAncien), ancien: marquer(ancien, actuel, communsAncien, communsActuel) };
}

/** Lit la sauvegarde d'un ordre en conflit et l'ordre actuel du même dossier, comparés, avec les titres des pages. Ne modifie rien. */
export async function lireConflitDOrdre(fs: LocalFs, sauvegarde: string): Promise<OrderConflict> {
  if (!estConflitDOrdre(sauvegarde) || (await fs.infos(sauvegarde))?.estDossier !== false) {
    throw new VaultError('introuvable', "Cette sauvegarde d'ordre a déjà été écartée.");
  }
  const dossier = dossierParent(sauvegarde);
  const ids = (texte: string): string[] => [...new Set(texte.split(/\r?\n/).map((ligne) => ligne.trim()).filter(estId))];
  const titres = new Map((await lireEnfants(fs, dossier)).flatMap((enfant) => (enfant.id === null ? [] : [[enfant.id, enfant.titre] as const])));
  return comparerOrdres(await lireOrdre(fs, dossier), ids(await fs.lireTexte(sauvegarde)), titres);
}
