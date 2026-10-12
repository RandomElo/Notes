import type { LocalFs } from '../fs/local-fs';
import { enregistrerCorps, lireCorps } from './content';
import type { VaultContext } from './context';
import type { TreeNode } from './tree';

/**
 * Liens entre pages (docs/spec/stockage.md) : `[Titre](notes://uuid)` dans le corps. Pour
 * core le corps reste un texte : les mentions s'y repèrent par leur forme,
 * sans lire le Markdown. Ce qui est dans un bloc de code n'est que du texte et
 * ne compte pas, sauf dans un bloc `notes-callout`, dont le texte en contient.
 */

export interface MentionFound {
  /** Identifiant visé, en minuscules. */
  id: string;
  /** Texte du lien dans le fichier. */
  libelle: string;
}

export interface BrokenMention extends MentionFound {
  /** Page qui contient la mention. */
  chemin: string;
  titre: string;
}

const mention = /\[((?:[^\]\\\n]|\\.)*)\]\(\s*notes:\/\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})[\s)"]/gi;
const cloture = /^ {0,3}(`{3,}|~{3,})(.*)$/;

/** Lignes du corps hors des blocs de code (un bloc `notes-callout` est gardé). */
function lignesHorsDuCode(corps: string): string[] {
  const gardees: string[] = [];
  let ouverte: { marque: string; garder: boolean } | null = null;
  for (const ligne of corps.split(/\r?\n/)) {
    const trouve = cloture.exec(ligne);
    if (ouverte === null && trouve !== null) {
      ouverte = { marque: trouve[1] as string, garder: (trouve[2] ?? '').trim() === 'notes-callout' };
    } else if (ouverte !== null && trouve !== null && (trouve[1] as string).startsWith(ouverte.marque) && (trouve[2] ?? '').trim() === '') {
      ouverte = null;
    } else if (ouverte === null || ouverte.garder) {
      gardees.push(ligne);
    }
  }
  return gardees;
}

/** Mentions d'un corps de page, dans l'ordre, doublons compris. */
export function mentionsDuCorps(corps: string): MentionFound[] {
  if (!/notes:\/\//i.test(corps)) {
    return [];
  }
  const trouvees: MentionFound[] = [];
  for (const ligne of lignesHorsDuCode(corps)) {
    for (const [, libelle = '', id = ''] of ligne.matchAll(mention)) {
      trouvees.push({ id: id.toLowerCase(), libelle: libelle.replace(/\\(.)/g, '$1') });
    }
  }
  return trouvees;
}

/** Les pages importées de l'arbre, à plat. */
function pagesDe(arbre: readonly TreeNode[]): TreeNode[] {
  const pages: TreeNode[] = [];
  const parcourir = (noeuds: readonly TreeNode[]): void => {
    for (const noeud of noeuds) {
      if (noeud.id !== null) {
        pages.push(noeud);
      }
      parcourir(noeud.enfants);
    }
  };
  parcourir(arbre);
  return pages;
}

/** Corps de chaque page importée. Une page illisible est passée. */
async function* corpsDesPages(fs: LocalFs, arbre: readonly TreeNode[]): AsyncGenerator<{ page: TreeNode; corps: string }> {
  for (const page of pagesDe(arbre)) {
    try {
      yield { page, corps: await lireCorps(fs, page.chemin) };
    } catch {
      // Page disparue ou illisible depuis la lecture de l'arbre : elle ne mentionne rien qu'on puisse changer.
    }
  }
}

/** Chemins des pages qui mentionnent la page « id ». */
export async function pagesQuiMentionnent(fs: LocalFs, arbre: readonly TreeNode[], id: string): Promise<string[]> {
  const cible = id.toLowerCase();
  const chemins: string[] = [];
  for await (const { page, corps } of corpsDesPages(fs, arbre)) {
    if (mentionsDuCorps(corps).some((trouvee) => trouvee.id === cible)) {
      chemins.push(page.chemin);
    }
  }
  return chemins;
}

/** Mentions dont la page n'existe pas (ou plus) dans le dossier des notes, page par page. */
export async function mentionsCassees(fs: LocalFs, arbre: readonly TreeNode[]): Promise<BrokenMention[]> {
  const existantes = new Set(pagesDe(arbre).map((page) => (page.id as string).toLowerCase()));
  const cassees: BrokenMention[] = [];
  for await (const { page, corps } of corpsDesPages(fs, arbre)) {
    const vues = new Set<string>();
    for (const trouvee of mentionsDuCorps(corps)) {
      if (!existantes.has(trouvee.id) && !vues.has(trouvee.id)) {
        vues.add(trouvee.id);
        cassees.push({ ...trouvee, chemin: page.chemin, titre: page.titre });
      }
    }
  }
  return cassees;
}

/**
 * Réécrit le corps d'une page par « transformer », qui rend null s'il n'y a
 * rien à changer. L'écriture passe par enregistrerCorps : le front-matter est
 * gardé, et un fichier modifié entre la lecture et l'écriture est mis de côté.
 * Vrai si la page a été écrite.
 */
export async function reecrireCorps(contexte: VaultContext, chemin: string, transformer: (corps: string) => string | null): Promise<boolean> {
  const corps = await lireCorps(contexte.fs, chemin);
  const nouveau = transformer(corps);
  if (nouveau === null || nouveau === corps) {
    return false;
  }
  return (await enregistrerCorps(contexte, chemin, { corps: nouveau, corpsDeBase: corps })).ecrit;
}
