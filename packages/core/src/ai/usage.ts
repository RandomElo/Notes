import { estSauvegardeDeConflit } from '../sync/conflict';
import type { VaultContext } from '../vault/context';

/**
 * Historique des appels aux fonctions IA (docs/spec/ia.md), dans
 * `.notes/ai-usage.json`, synchronisé. Un enregistrement par appel : il sert
 * aux totaux (dépense du jour, graphiques) et à caler les estimations sur ce
 * que le modèle a vraiment consommé. Rien du contenu des pages n'y est écrit.
 */
export const fichierDHistoriqueIa = '.notes/ai-usage.json';
const dossier = '.notes';

export type AiFunction = 'relecture' | 'mise-au-propre' | 'memo';
/** Ollama sur le poste, ou LiteLLM (API compatible OpenAI, payante) sur le réseau. */
export type AiProvider = 'ollama' | 'litellm';

export interface AiEstimate {
  /** Tokens d'entrée comptés par Notes, avant calage sur l'historique. */
  entreeComptee: number;
  entree: number;
  sortie: number;
  /** En dollars, null pour un modèle local. */
  coutUsd: number | null;
}

export interface AiRun {
  /** Identifiant tiré au hasard : deux appareils n'écrivent jamais le même. */
  id: string;
  /** Millisecondes depuis l'époque Unix, fin de l'appel. */
  date: number;
  fonction: AiFunction;
  fournisseur: AiProvider;
  modele: string;
  /** Tokens comptés par le fournisseur. */
  entree: number;
  sortie: number;
  /** Coût réel en dollars, null pour un modèle local. */
  coutUsd: number | null;
  estimation: AiEstimate;
  dureeMs: number;
  /** Appel arrêté avant la fin : la sortie est comptée par Notes, pas par le fournisseur. */
  annule: boolean;
}

interface UsageFile {
  version: 1;
  appels: AiRun[];
}

const fonctions: readonly AiFunction[] = ['relecture', 'mise-au-propre', 'memo'];
const fournisseurs: readonly AiProvider[] = ['ollama', 'litellm'];

const entier = (valeur: unknown): number | null => (typeof valeur === 'number' && Number.isFinite(valeur) && valeur >= 0 ? Math.round(valeur) : null);
const montant = (valeur: unknown): number | null => (typeof valeur === 'number' && Number.isFinite(valeur) && valeur >= 0 ? valeur : null);

function lireEstimation(valeur: unknown): AiEstimate | null {
  if (typeof valeur !== 'object' || valeur === null) {
    return null;
  }
  const brut = valeur as Record<string, unknown>;
  const entree = entier(brut['entree']);
  const sortie = entier(brut['sortie']);
  return entree === null || sortie === null ? null : { entreeComptee: entier(brut['entreeComptee']) ?? entree, entree, sortie, coutUsd: montant(brut['coutUsd']) };
}

/** Un enregistrement venu du fichier, ou null s'il est abîmé (ignoré, sans bloquer le reste). */
export function lireAppel(valeur: unknown): AiRun | null {
  if (typeof valeur !== 'object' || valeur === null) {
    return null;
  }
  const brut = valeur as Record<string, unknown>;
  const id = brut['id'];
  const fonction = brut['fonction'];
  const fournisseur = brut['fournisseur'];
  const modele = brut['modele'];
  const date = entier(brut['date']);
  const entree = entier(brut['entree']);
  const sortie = entier(brut['sortie']);
  const dureeMs = entier(brut['dureeMs']);
  const estimation = lireEstimation(brut['estimation']);
  if (
    typeof id !== 'string' ||
    !/^[0-9a-f-]{8,64}$/.test(id) ||
    !fonctions.includes(fonction as AiFunction) ||
    !fournisseurs.includes(fournisseur as AiProvider) ||
    typeof modele !== 'string' ||
    modele.length > 200 ||
    date === null ||
    entree === null ||
    sortie === null ||
    dureeMs === null ||
    estimation === null
  ) {
    return null;
  }
  return {
    id,
    date,
    fonction: fonction as AiFunction,
    fournisseur: fournisseur as AiProvider,
    modele,
    entree,
    sortie,
    coutUsd: montant(brut['coutUsd']),
    estimation,
    dureeMs,
    annule: brut['annule'] === true,
  };
}

/** Les appels d'un contenu de fichier. Un fichier illisible ne donne rien plutôt que de bloquer. */
export function appelsDuFichier(texte: string): AiRun[] {
  try {
    const brut: unknown = JSON.parse(texte.replace(/^\uFEFF/, ''));
    const appels = typeof brut === 'object' && brut !== null ? (brut as Record<string, unknown>)['appels'] : null;
    return Array.isArray(appels) ? appels.map(lireAppel).filter((appel): appel is AiRun => appel !== null) : [];
  } catch {
    return [];
  }
}

/** Réunit des listes d'appels sans doublon, dans l'ordre des dates. */
export function fusionnerAppels(...listes: AiRun[][]): AiRun[] {
  const parId = new Map<string, AiRun>();
  for (const appel of listes.flat()) {
    parId.set(appel.id, appel);
  }
  return [...parId.values()].sort((a, b) => a.date - b.date || a.id.localeCompare(b.id));
}

/**
 * Lit l'historique, versions mises de côté par la sync comprises
 * (`ai-usage.conflit-[date].json`) : un appel fait sur chaque appareil entre
 * deux cycles n'est jamais perdu.
 */
export async function lireHistoriqueIa(contexte: VaultContext): Promise<AiRun[]> {
  const { fs } = contexte;
  if ((await fs.infos(dossier)) === null) {
    return [];
  }
  const fichiers = (await fs.lister(dossier))
    .filter((entree) => !entree.estDossier && (entree.nom === 'ai-usage.json' || (entree.nom.startsWith('ai-usage.') && estSauvegardeDeConflit(entree.nom))))
    .map((entree) => `${dossier}/${entree.nom}`);
  const listes: AiRun[][] = [];
  for (const fichier of fichiers) {
    listes.push(appelsDuFichier(await fs.lireTexte(fichier)));
  }
  return fusionnerAppels(...listes);
}

/** Ajoute un appel. Le fichier réécrit contient aussi ce que gardaient ses versions en conflit. Rend l'historique à jour. */
export async function ajouterALHistoriqueIa(contexte: VaultContext, appel: AiRun): Promise<AiRun[]> {
  const valide = lireAppel(appel);
  if (valide === null) {
    throw new Error('Appel IA mal formé.');
  }
  const appels = fusionnerAppels(await lireHistoriqueIa(contexte), [valide]);
  const contenu: UsageFile = { version: 1, appels };
  await contexte.fs.creerDossier(dossier);
  await contexte.fs.ecrireTexte(fichierDHistoriqueIa, `${JSON.stringify(contenu, null, 1)}\n`);
  return appels;
}
