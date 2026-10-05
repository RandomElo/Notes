import type { Tiktoken } from 'js-tiktoken/lite';
import type { AiProvider } from '@notes/core';

/**
 * Comptage local des tokens d'une demande, avant de l'envoyer (README §12).
 * LiteLLM (modèles d'OpenAI) : le découpage `o200k_base` de leurs modèles récents, plus ce que
 * coûte l'enveloppe des deux messages. Ollama : chaque modèle a son propre
 * découpage, qu'on ne peut pas lire ici ; on part de la longueur du texte. Dans
 * les deux cas, l'écart avec ce que compte le fournisseur est rattrapé par le
 * calage sur l'historique (`calibrer` de @notes/core).
 */

let encodage: Promise<Tiktoken> | null = null;

/**
 * Tokens d'un texte pour un modèle OpenAI. Le découpage (2 Mo) n'est chargé
 * qu'au premier appel, dans un morceau à part : il ne ralentit pas le
 * démarrage de Notes quand on ne se sert pas de LiteLLM.
 */
export async function tokensOpenAi(texte: string): Promise<number> {
  encodage ??= Promise.all([import('js-tiktoken/lite'), import('js-tiktoken/ranks/o200k_base')]).then(([{ Tiktoken }, rangs]) => new Tiktoken(rangs.default));
  return (await encodage).encode(texte, [], []).length;
}

/** Caractères par token d'un texte français, pour un modèle local avant tout historique. */
export const caracteresParToken = 3.6;

/** Enveloppe d'un message de conversation (rôle, séparateurs), plus l'amorce de la réponse. */
const tokensParMessage = 4;
const tokensDAmorce = 3;

/** Tokens d'entrée d'une demande (consigne et texte), avant calage. */
export async function compterEntree(fournisseur: AiProvider, systeme: string, texte: string): Promise<number> {
  if (fournisseur === 'litellm') {
    return (await tokensOpenAi(systeme)) + (await tokensOpenAi(texte)) + 2 * tokensParMessage + tokensDAmorce;
  }
  return Math.ceil((systeme.length + texte.length) / caracteresParToken) + 2 * tokensParMessage + tokensDAmorce;
}

/** Tokens d'un texte reçu, pour une demande annulée dont le fournisseur n'a pas donné le compte. */
export async function compterSortie(fournisseur: AiProvider, texte: string): Promise<number> {
  return fournisseur === 'litellm' ? tokensOpenAi(texte) : Math.ceil(texte.length / caracteresParToken);
}
