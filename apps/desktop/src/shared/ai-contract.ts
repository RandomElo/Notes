import type { AiPageFunction, AiProvider, AiRun, AiSettings, UsageBucket, UsagePeriod } from '@notes/core';

/**
 * Fonctions IA (README §12) : ce que le main et le renderer s'échangent.
 * Les canaux sont dans `ipc-contract.ts`, avec les autres.
 */

export const libellesDesFonctions: Record<AiPageFunction, string> = {
  relecture: 'Relecture stylistique',
  'mise-au-propre': 'Mise au propre',
};

/** Consignes de Notes, remplaçables dans les réglages. Les repères `[[BLOC-n]]` sont expliqués au modèle. */
export const consignesParDefaut: Record<AiPageFunction, string> = {
  relecture: [
    'Tu relis un texte en français, écrit en Markdown.',
    'Améliore la fluidité et la formulation, corrige les fautes, sans changer le sens ni la structure : garde les titres, les listes, les tableaux, l’ordre des paragraphes, les liens et la mise en forme existante.',
    'Ne résume pas, n’ajoute aucune idée, ne retire aucune information.',
    'Les lignes de la forme [[BLOC-1]] remplacent des blocs mis de côté : recopie-les telles quelles, à leur place.',
    'Réponds uniquement par le texte relu, en Markdown, sans phrase d’introduction ni de conclusion, sans emoji et sans gras ajouté.',
  ].join('\n'),
  'mise-au-propre': [
    'Tu reçois des notes en vrac, en français, écrites en Markdown.',
    'Transforme-les en un document structuré et rédigé : des titres (# pour le premier niveau), des paragraphes complets, des listes quand elles s’y prêtent.',
    'Développe les abréviations et les phrases télégraphiques. Ce n’est pas un résumé : tout ce que disent les notes doit rester. N’invente aucun fait.',
    'Garde les liens tels quels. Les lignes de la forme [[BLOC-1]] remplacent des blocs mis de côté : recopie-les telles quelles, à l’endroit qui convient.',
    'Réponds uniquement par le document, en Markdown, sans phrase d’introduction ni de conclusion, sans emoji et sans gras ajouté.',
  ].join('\n'),
};

/** Un modèle installé dans Ollama, vu par rapport à la carte du poste. */
export interface AiLocalModelView {
  nom: string;
  parametres: number | null;
  /** Utilisable sur cette carte. */
  utilisable: boolean;
  /** Pourquoi il ne l'est pas. */
  raison: string | null;
}

/** Un modèle de LiteLLM et son tarif en dollars par million de tokens, avec d'où il vient. */
export interface AiApiModelView {
  nom: string;
  tarif: { entree: number; sortie: number } | null;
  source: 'reglages' | 'litellm' | 'notes' | null;
}

/** Ce que les réglages montrent des fonctions IA de ce poste. */
export interface AiState {
  reglages: AiSettings;
  /** La carte graphique retenue, null si aucune n'est vue (ou Ollama sur une autre machine). */
  carte: { nom: string; vram: number | null; dediee: boolean } | null;
  /** Ollama répond-il à l'adresse des réglages ? */
  ollama: 'joignable' | 'injoignable';
  /** Ce que la carte permet : IA locale possible ou non, modèle choisi par Notes, modèles installés. */
  local: {
    disponible: boolean;
    raison: string | null;
    automatique: string | null;
    modeles: AiLocalModelView[];
    /** Modèle à installer, quand aucun ne convient et que la carte le permet. */
    conseil: string | null;
  };
  /** Clé de LiteLLM : enregistrée chiffrée, gardée pour la session (pas de trousseau), ou absente. */
  cleLitellm: 'absent' | 'enregistre' | 'session';
  /** Modèles de LiteLLM, null sans adresse, sans clé, ou si LiteLLM ne répond pas. */
  modelesLitellm: AiApiModelView[] | null;
  /** Date du relevé des tarifs connus de Notes (dernier recours). */
  dateDesTarifs: string;
  depenseDuJourUsd: number;
  depenseDuMoisUsd: number;
}

export interface AiRequest {
  fonction: AiPageFunction;
  /** Corps de la page en Markdown, tel qu'il est dans l'éditeur. */
  markdown: string;
  titre: string;
}

/** Fenêtre d'estimation, avant de lancer. */
export type AiEstimateResult =
  | {
      ok: true;
      fournisseur: AiProvider;
      modele: string;
      /** Modèle choisi par Notes d'après la carte graphique. */
      automatique: boolean;
      entree: number;
      sortie: number;
      /** null pour un modèle local, ou un modèle de LiteLLM sans tarif connu. */
      coutUsd: number | null;
      /** Vrai pour un modèle de LiteLLM sans tarif connu. */
      tarifInconnu: boolean;
      /** null tant qu'aucun appel de ce modèle n'est connu. */
      dureeMs: number | null;
      /** Appels passés sur lesquels repose l'estimation de la sortie. */
      appelsConnus: number;
      depenseDuJourUsd: number;
      depenseDuMoisUsd: number;
      /** Seuil d'alerte du mois, et vrai s'il est déjà atteint ou le serait par cet appel. */
      seuilMensuelUsd: number | null;
      seuilDepasse: boolean;
    }
  | { ok: false; message: string };

/** Avancement d'un appel en cours, envoyé par le main. */
export interface AiProgress {
  /** Texte reçu jusque-là (brut, avant nettoyage). */
  texte: string;
  /** Tokens de sortie reçus, comptés approximativement. */
  sortie: number;
}

export type AiRunResult =
  | {
      ok: true;
      /** Proposition nettoyée, blocs réservés remis en place. */
      markdown: string;
      avertissements: string[];
      appel: AiRun;
    }
  | { ok: false; annule: boolean; message: string };

export interface AiUsageView {
  appels: AiRun[];
  /** Une fonction au moins passe par LiteLLM : la dépense du jour s'affiche dans la barre de statut. */
  litellmChoisi: boolean;
  totaux: Record<UsagePeriod, UsageBucket[]>;
  depenseDuJourUsd: number;
  depenseDuMoisUsd: number;
  seuilMensuelUsd: number | null;
}

/** Nombre de périodes montrées par graphique. */
export const periodesMontrees: Record<UsagePeriod, number> = { jour: 30, semaine: 12, mois: 12, annee: 5 };
