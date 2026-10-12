import type { GpuInfo } from './hardware';

/**
 * Choix du modèle local selon la carte graphique (README §12, choix d'Eloi du
 * 2026-10-05) : Notes regarde la carte, garde les modèles installés qui
 * tiennent entièrement dans sa mémoire vidéo et sont assez gros pour un
 * résultat correct, et prend le meilleur. Si aucun ne convient, l'IA locale
 * est bloquée, avec la raison. Un modèle qui déborde sur le processeur est
 * quatre fois plus lent (mesuré : 9 tokens par seconde contre 40).
 */

export interface LocalModel {
  nom: string;
  /** Taille sur le disque, en octets (`/api/tags`). */
  taille: number;
  /** Milliards de paramètres, null si Ollama ne le dit pas. */
  parametres: number | null;
  famille: string;
  /** Mémoire du contexte par token, en octets, null si l'architecture n'est pas connue. */
  kvParToken: number | null;
}

export interface LocalModelFit {
  nom: string;
  parametres: number | null;
  /** Tient en mémoire vidéo avec le contexte minimal ; null si la mémoire de la carte est inconnue. */
  tient: boolean | null;
  /** Plus grand contexte qui tient encore, en tokens ; null si on ne sait pas le calculer. */
  contexteMax: number | null;
  /** Utilisable : tient (ou inconnu) et assez gros. */
  utilisable: boolean;
  /** Pourquoi il ne l'est pas, en français. */
  raison: string | null;
}

export interface LocalVerdict {
  disponible: boolean;
  /** Pourquoi l'IA locale est bloquée, null si elle est disponible. */
  raison: string | null;
  modeles: LocalModelFit[];
  /** Le modèle que Notes choisit seule. */
  automatique: string | null;
}

/** Part de la mémoire vidéo laissée au modèle : le bureau en garde une partie. */
const partUtilisable = 0.92;
/** Tampons de calcul d'Ollama en plus des poids et du contexte. */
const tampon = 350 * 1024 ** 2;
/** En dessous, la page la plus courte ne tient pas avec sa réponse. */
export const contexteMinimal = 4096;
/** Sous ce nombre de paramètres, les relectures en français ne valent rien. */
export const parametresMinimaux = 7;
/** Contexte par token quand l'architecture n'est pas lue (un modèle de 8B courant). */
const kvParDefaut = 160 * 1024;

/**
 * Familles préférées à taille égale, d'après la comparaison du 2026-10-05 sur
 * des pages en français : Qwen3 corrige sans rien changer d'autre ; Gemma 3
 * écrit le mieux ; Ministral réécrit trop (structure changée, contenu
 * inventé à la mise au propre), il passe en dernier.
 */
const famillesPreferees = ['qwen3', 'gemma3'];
const famillesEnDernier = ['mistral3'];

const go = (octets: number): string => `${Math.round((octets / 1024 ** 3) * 10) / 10} Go`.replace('.', ',');

/** Classe de taille : 8B et 9B se valent, 12B les dépasse. La famille départage à l'intérieur d'une classe. */
const classeDeTaille = (parametres: number | null): number => [10, 20, 40].filter((seuil) => (parametres ?? 0) >= seuil).length;

function rang(modele: LocalModelFit, famille: string): number[] {
  const preferee = famillesPreferees.indexOf(famille);
  return [-classeDeTaille(modele.parametres), preferee === -1 ? (famillesEnDernier.includes(famille) ? 99 : 50) : preferee];
}

/** « 8.2B » ou « 500M » en milliards de paramètres. */
export function lireParametres(valeur: unknown): number | null {
  const trouve = typeof valeur === 'string' ? /^([\d.]+)\s*([BM])$/i.exec(valeur.trim()) : null;
  if (trouve === null) {
    return null;
  }
  const nombre = Number(trouve[1]);
  return trouve[2]!.toUpperCase() === 'B' ? nombre : nombre / 1000;
}

/** Mémoire du contexte par token d'après l'architecture (`/api/show`, `model_info`) : clés et valeurs de chaque couche, en 16 bits. */
export function kvParTokenDe(infos: Record<string, unknown>): number | null {
  const architecture = infos['general.architecture'];
  if (typeof architecture !== 'string') {
    return null;
  }
  const nombre = (cle: string): number | null => {
    const valeur = infos[`${architecture}.${cle}`];
    if (Array.isArray(valeur)) {
      const nombres = valeur.filter((v): v is number => typeof v === 'number');
      return nombres.length > 0 ? Math.max(...nombres) : null;
    }
    return typeof valeur === 'number' && valeur > 0 ? valeur : null;
  };
  const couches = nombre('block_count');
  const tetesKv = nombre('attention.head_count_kv') ?? nombre('attention.head_count');
  const tetes = nombre('attention.head_count');
  const largeur = nombre('embedding_length');
  const cle = nombre('attention.key_length') ?? (largeur !== null && tetes !== null ? largeur / tetes : null);
  const valeur = nombre('attention.value_length') ?? cle;
  if (couches === null || tetesKv === null || cle === null || valeur === null) {
    return null;
  }
  return couches * tetesKv * (cle + valeur) * 2;
}

/**
 * Ce que la carte permet. `carte` est null quand Ollama tourne sur une autre
 * machine ou qu'aucune carte n'est vue. Un modèle qui déborde malgré tout
 * (carte occupée par une autre application) est arrêté pendant l'appel
 * (`ai-service.ts`).
 */
export function evaluerModeles(installes: LocalModel[], carte: GpuInfo | null, ollamaSurLePoste: boolean): LocalVerdict {
  const bloque = (raison: string): LocalVerdict => ({ disponible: false, raison, modeles: [], automatique: null });
  if (ollamaSurLePoste && carte === null) {
    return bloque('Aucune carte graphique n’est visible sur ce poste : pas d’IA locale ici.');
  }
  if (ollamaSurLePoste && carte !== null && !carte.dediee) {
    return bloque(`${carte.nom} est une carte intégrée, trop faible pour un modèle local : pas d’IA locale ici.`);
  }
  const vram = ollamaSurLePoste ? (carte?.vram ?? null) : null;
  const budget = vram === null ? null : vram * partUtilisable;

  const familles = new Map(installes.map((modele) => [modele.nom, modele.famille]));
  const modeles = installes.map((modele): LocalModelFit => {
    const kv = modele.kvParToken ?? kvParDefaut;
    const contexteMax = budget === null ? null : Math.floor((budget - modele.taille - tampon) / kv);
    const tient = contexteMax === null ? null : contexteMax >= contexteMinimal;
    const assezGros = modele.parametres === null || modele.parametres >= parametresMinimaux;
    let raison: string | null = null;
    if (tient === false) {
      raison = `Trop gros pour les ${go(vram!)} de la carte.`;
    } else if (!assezGros) {
      raison = `Trop petit (${modele.parametres} milliards de paramètres) pour un résultat correct.`;
    }
    return { nom: modele.nom, parametres: modele.parametres, tient, contexteMax: contexteMax === null ? null : Math.max(0, contexteMax), utilisable: tient !== false && assezGros, raison };
  });

  const utilisables = modeles.filter((modele) => modele.utilisable);
  if (installes.length === 0) {
    return { ...bloque('Aucun modèle n’est installé dans Ollama.'), modeles };
  }
  if (utilisables.length === 0) {
    const raison = vram === null ? 'Aucun modèle installé ne convient.' : `Aucun modèle installé ne tient dans les ${go(vram)} de la carte avec une qualité correcte.`;
    return { disponible: false, raison, modeles, automatique: null };
  }
  const classes = [...utilisables].sort((a, b) => {
    const [ta, fa] = rang(a, familles.get(a.nom) ?? '');
    const [tb, fb] = rang(b, familles.get(b.nom) ?? '');
    return ta! - tb! || fa! - fb! || a.nom.localeCompare(b.nom);
  });
  return { disponible: true, raison: null, modeles, automatique: classes[0]!.nom };
}

/** Modèle conseillé à installer selon la mémoire vidéo, pour le message d'un poste sans modèle. */
export function modeleConseille(vram: number | null): string | null {
  if (vram === null || vram < 7 * 1024 ** 3) {
    return null;
  }
  return vram >= 12 * 1024 ** 3 ? 'gemma3:12b' : 'qwen3:8b';
}
