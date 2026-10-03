import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { parseDocument, stringify } from 'yaml';
import { typesDeCallout } from '../schema/nodes/callout';
import { analyseur } from './tokenizer';
import type { Jeton } from './tokenizer';

/**
 * Callout dans le fichier (README §4) : un bloc fencé `notes-callout` dont le
 * contenu est du YAML, avec trois clés facultatives.
 *
 * ```notes-callout
 * type: warning
 * icon: ⚠️
 * text: |-
 *   Couper le **wifi** avant.
 *
 *   Deuxième paragraphe.
 * ```
 *
 * `text` est du Markdown fait seulement de paragraphes. Tout autre contenu
 * (clé inconnue, YAML invalide, liste dans le texte) laisse le bloc en bloc de
 * code : rien n'est perdu, il se corrige à la main.
 */

export const langageDuCallout = 'notes-callout';

const cles = ['type', 'icon', 'text'];

export interface LectureDeCallout {
  type: string | null;
  icon: string | null;
  paragraphes: ProseMirrorNode[];
}

/**
 * Lit le contenu YAML d'un callout. null s'il n'est pas de la forme attendue.
 * « convertir » transforme les jetons du texte en nœuds (markdown/nodes.ts).
 */
export function lireCallout(yaml: string, convertir: (jetons: Jeton[]) => ProseMirrorNode[]): LectureDeCallout | null {
  // Schéma « failsafe » : toutes les valeurs restent du texte (« 2026 » ne devient pas un nombre).
  const document = parseDocument(yaml, { schema: 'failsafe', uniqueKeys: true });
  if (document.errors.length > 0 || document.warnings.length > 0) {
    return null;
  }
  let valeur: unknown;
  try {
    valeur = document.toJS();
  } catch {
    // Alias sans ancre, par exemple : ce n'est pas un callout lisible.
    return null;
  }
  const champs = valeur === null || valeur === undefined ? {} : valeur;
  if (typeof champs !== 'object' || Array.isArray(champs)) {
    return null;
  }
  const entrees = Object.entries(champs as Record<string, unknown>);
  if (entrees.some(([cle, contenu]) => !cles.includes(cle) || typeof contenu !== 'string')) {
    return null;
  }
  const { type = null, icon = null, text = '' } = champs as Record<string, string | undefined>;
  if (type !== null && !(typesDeCallout as readonly string[]).includes(type)) {
    return null;
  }
  let paragraphes: ProseMirrorNode[];
  try {
    paragraphes = convertir(analyseur.parse(text, {}));
  } catch {
    return null;
  }
  if (paragraphes.some((noeud) => noeud.type.name !== 'paragraph')) {
    return null;
  }
  return { type, icon, paragraphes };
}

/**
 * Le YAML d'un callout. « texte » est le Markdown de ses paragraphes. La lib
 * choisit la forme de chaque valeur (simple, entre guillemets, bloc littéral)
 * pour qu'elle se relise à l'identique.
 */
export function ecrireCallout(type: string | null, icon: string | null, texte: string): string {
  const champs: Record<string, string> = {};
  if (type !== null) {
    champs['type'] = type;
  }
  if (icon !== null) {
    champs['icon'] = icon;
  }
  if (texte !== '') {
    champs['text'] = texte;
  }
  if (Object.keys(champs).length === 0) {
    return '';
  }
  return stringify(champs, { schema: 'failsafe', lineWidth: 0, blockQuote: 'literal' }).replace(/\n$/, '');
}
