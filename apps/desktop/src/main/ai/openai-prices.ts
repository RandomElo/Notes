import type { AiPrice } from '@notes/core';

/**
 * Tarifs d'OpenAI connus de Notes, en dollars par million de tokens, relevés
 * sur developers.openai.com/api/docs/pricing le 2026-10-05 (tarif standard,
 * contexte court). Ils ne servent qu'en dernier recours : un tarif saisi dans
 * les réglages passe avant, puis celui que donne LiteLLM. Un modèle sans tarif
 * nulle part n'a pas d'estimation de coût.
 */
export const dateDesTarifs = '2026-10-05';

export const tarifsConnus: Readonly<Record<string, AiPrice>> = {
  'gpt-6-luna': { entree: 0.1, sortie: 0.5 },
  'gpt-5.6-sol': { entree: 4, sortie: 20 },
  'gpt-5.6-terra': { entree: 2, sortie: 12 },
  'gpt-5.6-luna': { entree: 0.2, sortie: 1.2 },
  'gpt-5.5': { entree: 5, sortie: 30 },
  'gpt-5.4': { entree: 2.5, sortie: 15 },
  'gpt-5.4-mini': { entree: 0.75, sortie: 4.5 },
  'gpt-5.4-nano': { entree: 0.2, sortie: 1.25 },
  'gpt-5.2': { entree: 1.75, sortie: 14 },
  'gpt-5.1': { entree: 1.25, sortie: 10 },
  'gpt-5': { entree: 1.25, sortie: 10 },
  'gpt-5-mini': { entree: 0.25, sortie: 2 },
  'gpt-5-nano': { entree: 0.05, sortie: 0.4 },
  'gpt-4.1': { entree: 2, sortie: 8 },
  'gpt-4.1-mini': { entree: 0.4, sortie: 1.6 },
  'gpt-4.1-nano': { entree: 0.1, sortie: 0.4 },
};

export type PriceSource = 'reglages' | 'litellm' | 'notes';

/**
 * Tarif d'un modèle : celui des réglages, sinon celui de LiteLLM, sinon celui
 * de Notes. Chez Notes, un nom préfixé (`openai/gpt-5.6-luna`) ou daté
 * (`gpt-5.4-mini-2026-03-17`) prend celui de son modèle.
 */
export function tarifDuModele(modele: string, saisis: Readonly<Record<string, AiPrice>>, litellm: AiPrice | null = null): { tarif: AiPrice; source: PriceSource } | null {
  if (saisis[modele] !== undefined) {
    return { tarif: saisis[modele], source: 'reglages' };
  }
  if (litellm !== null) {
    return { tarif: litellm, source: 'litellm' };
  }
  const nu = modele.replace(/^.*\//, '').replace(/-\d{4}-\d{2}-\d{2}$/, '');
  const connu = tarifsConnus[modele] ?? tarifsConnus[nu];
  return connu === undefined ? null : { tarif: connu, source: 'notes' };
}

export function coutEnDollars(tarif: AiPrice, entree: number, sortie: number): number {
  return (entree * tarif.entree + sortie * tarif.sortie) / 1_000_000;
}
