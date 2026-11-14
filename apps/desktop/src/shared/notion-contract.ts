import type { TreeNode } from '@notes/core';

/*
 * Contrat de l'import de Notion (docs/spec/import-notion.md), entre la
 * rubrique « Import Notion » des réglages et le main.
 */

/** Ce que devient une base de données de Notion. */
export type NotionDatabaseChoice = 'tableau-et-pages' | 'pages' | 'tableau' | 'ignorer';

export interface NotionDatabaseView {
  /** Identifie la base d'une analyse à l'import. */
  cle: string;
  titre: string;
  /** Titre de la page où elle se trouve. */
  page: string;
  lignes: number;
}

/** Pourquoi une page est proposée à la suppression : décochée d'office, on peut la recocher. */
export type NotionFlag = 'vide' | 'modele' | 'doublon' | 'sans-titre';

/** Une page de l'export, dans l'arbre à cocher. */
export interface NotionPageNode {
  /** Identifie la page d'une analyse à l'import. */
  fichier: string;
  titre: string;
  /** Emoji de la page, null sinon. */
  icone: string | null;
  signalements: NotionFlag[];
  pdf: { nom: string; taille: number }[];
  /** Clés des bases qui sont dans cette page. */
  bases: string[];
  enfants: NotionPageNode[];
}

export interface NotionAnalysis {
  pages: number;
  images: number;
  bases: NotionDatabaseView[];
  arbre: NotionPageNode[];
}

export type NotionPreviewResult = { ok: true; corps: string; images: Record<string, string> } | { ok: false; erreur: string };

export type NotionAnalysisResult = { ok: true; analyse: NotionAnalysis } | { ok: false; erreur: string };

export type NotionImportResult =
  | { ok: true; pages: number; avertissements: { message: string; pages: number }[]; arbre: TreeNode[]; arrete: boolean }
  | { ok: false; erreur: string };

/** Avancement : lecture des archives, puis création des pages et de leur contenu. */
export interface NotionProgress {
  etape: 'lecture' | 'import';
  faites: number;
  total: number;
}
