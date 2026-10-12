import type { AiPageFunction, AiRun, AiSettings, UsageBucket, UsagePeriod } from '@notes/core';

/**
 * Fonctions IA (docs/spec/ia.md) : ce que le main et le renderer s'échangent.
 * Les canaux sont dans `ipc-contract.ts`, avec les autres.
 */

export const libellesDesFonctions: Record<AiPageFunction, string> = {
  relecture: 'Relecture stylistique',
  'mise-au-propre': 'Mise au propre',
  memo: 'Mise en forme des mémos',
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
  // Essais du 2026-10-12 (docs/spec/ia.md) : Notes envoie une section à la fois, lignes déjà mises en liste, titres gardés à part.
  'mise-au-propre': [
    'Tu reçois les notes d’une section, prises en vrac (cours, réunion, lecture), en français, en Markdown, avec le titre de la section pour le contexte. Remets-les au propre pour qu’elles se relisent facilement des mois plus tard.',
    '',
    'Forme :',
    '- Tout ce qui s’énumère s’écrit en liste à puces « - », une idée par puce : exemples, étapes, outils, caractéristiques, faits courts mis bout à bout. Plusieurs lignes courtes à la suite forment une liste.',
    '- Une liste en puces reste une liste en puces : garde chaque puce, dans le même ordre. Une précision sur une puce va en sous-puce, décalée de deux espaces.',
    '- Une ligne qui n’est qu’un nom ou quelques mots reste une puce avec ces seuls mots, corrigés.',
    '- Une explication suivie (définition, raisonnement, comparaison) s’écrit en paragraphe de phrases complètes.',
    '- N’écris pas de titre : le titre de la section est déjà en place.',
    '',
    'Rédaction :',
    '- Corrige l’orthographe, la grammaire, les accords et les fautes de frappe, y compris dans les noms d’outils connus.',
    '- Complète les phrases télégraphiques ou en langage parlé pour qu’elles se lisent seules, sans changer le sens des mots : une expression familière garde son sens.',
    '- Ce n’est pas un résumé : chaque information reste, avec ses exemples et ses citations.',
    '- N’ajoute rien qui ne soit pas dans les notes : ni définition, ni exemple, ni explication, ni développement d’un sigle, ni phrase de synthèse, ni connaissance générale sur le sujet. Ne répète pas une information sous deux formes.',
    '- Une phrase inachevée reste telle quelle : ne la complète pas.',
    '- Le texte entre accents graves est une note pour plus tard : recopie-le tel quel, accents graves compris, sans en ajouter d’autres.',
    '- Garde les liens et les URL tels quels. Les lignes de la forme [[BLOC-1]] remplacent des blocs mis de côté : recopie-les telles quelles.',
    '',
    'Exemple :',
    'Titre de la section : Réunion',
    'Notes :',
    '- bilan T3 ok',
    '- Problème : livraisons en retard, fournisseur change en janvier',
    '- présents : Paul, Léa, moi',
    '- on revoit le budget',
    '',
    'Réponse :',
    '- Le bilan du troisième trimestre est bon.',
    '- Problème : les livraisons sont en retard. Le fournisseur change en janvier.',
    '- Présents :',
    '  - Paul',
    '  - Léa',
    '  - moi',
    '- Le budget sera revu.',
    '',
    'Réponds uniquement par les notes remises au propre, en Markdown, sans titre, sans phrase d’introduction ni de conclusion, sans emoji et sans gras ajouté.',
  ].join('\n'),
  memo: [
    'Tu reçois la transcription brute d’un mémo vocal en français : la ponctuation et certains mots peuvent être faux.',
    'Remets-la au propre en Markdown : ponctuation, majuscules, paragraphes ; une liste quand on énumère ; des titres seulement si le mémo aborde plusieurs sujets bien distincts.',
    'Corrige les mots mal transcrits quand le sens est évident, retire les hésitations (euh, ben, bon) et les répétitions.',
    'Garde le sens, le ton et toutes les informations. N’ajoute rien, ne résume pas.',
    'Réponds uniquement par le texte, sans phrase d’introduction ni de conclusion, sans emoji et sans gras ajouté.',
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
      modele: string;
      /** Modèle choisi par Notes d'après la carte graphique. */
      automatique: boolean;
      entree: number;
      sortie: number;
      /** null tant qu'aucun appel de ce modèle n'est connu. */
      dureeMs: number | null;
      /** Appels passés sur lesquels repose l'estimation de la sortie. */
      appelsConnus: number;
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

/** Ajouté à la consigne de la mise au propre copiée pour un autre outil, qui reçoit la page entière et non une section. */
export const pageEntiereACopier = 'Tu reçois ici la page entière, et non une section : garde ses titres tels quels, à leur place, et remets au propre les notes sous chacun.';

/** La consigne d'une fonction suivie du texte de la page, à coller dans un autre outil. */
export type AiPromptResult = { ok: true; texte: string } | { ok: false; message: string };

export interface AiUsageView {
  appels: AiRun[];
  totaux: Record<UsagePeriod, UsageBucket[]>;
}

/** Nombre de périodes montrées par graphique. */
export const periodesMontrees: Record<UsagePeriod, number> = { jour: 30, semaine: 12, mois: 12, annee: 5 };
