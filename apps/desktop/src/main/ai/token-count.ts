/**
 * Comptage local des tokens d'une demande, avant de l'envoyer (docs/spec/ia.md).
 * Chaque modèle d'Ollama a son propre découpage, qu'on ne peut pas lire ici :
 * on part de la longueur du texte, et l'écart avec ce que compte Ollama est
 * rattrapé par le calage sur l'historique (`calibrer` de @notes/core).
 */

/** Caractères par token d'un texte français, avant tout historique. */
export const caracteresParToken = 3.6;

/** Enveloppe d'un message de conversation (rôle, séparateurs), plus l'amorce de la réponse. */
const tokensParMessage = 4;
const tokensDAmorce = 3;

/** Tokens d'entrée d'une demande (consigne et texte), avant calage. */
export function compterEntree(systeme: string, texte: string): number {
  return Math.ceil((systeme.length + texte.length) / caracteresParToken) + 2 * tokensParMessage + tokensDAmorce;
}

/** Tokens d'un texte reçu, pour une demande annulée dont Ollama n'a pas donné le compte. */
export function compterSortie(texte: string): number {
  return Math.ceil(texte.length / caracteresParToken);
}
