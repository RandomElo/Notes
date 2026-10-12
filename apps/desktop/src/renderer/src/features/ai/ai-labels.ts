/** Textes des fonctions IA : tokens, durées, écarts. */

const nombre = new Intl.NumberFormat('fr-FR');

/** « 1 240 tokens ». */
export function libelleDeTokens(tokens: number): string {
  return `${nombre.format(Math.round(tokens))} token${Math.round(tokens) > 1 ? 's' : ''}`;
}

/** « environ 12 s », « environ 2 min 30 s ». */
export function libelleDeDuree(ms: number): string {
  const secondes = Math.max(1, Math.round(ms / 1000));
  if (secondes < 60) {
    return `environ ${secondes} s`;
  }
  const minutes = Math.floor(secondes / 60);
  const reste = secondes % 60;
  return reste === 0 ? `environ ${minutes} min` : `environ ${minutes} min ${reste} s`;
}

/** Écart entre le réel et l'estimé, en pourcentage signé : « +4 % », « −12 % », « exact ». */
export function libelleDEcart(reel: number, estime: number): string {
  if (estime === 0) {
    return reel === 0 ? 'exact' : '';
  }
  const ecart = Math.round(((reel - estime) / estime) * 100);
  if (ecart === 0) {
    return 'exact';
  }
  return `${ecart > 0 ? '+' : '−'}${Math.abs(ecart)} %`;
}

/** « environ 30 s restantes », « environ 2 min restantes » ; « presque fini » sous deux secondes. */
export function libelleDeTempsRestant(ms: number): string {
  return ms < 2000 ? 'presque fini' : `${libelleDeDuree(ms)} restantes`;
}

/**
 * Temps restant d'un appel à l'IA (docs/spec/ia.md). Avant les premiers mots, et
 * tant qu'ils sont peu nombreux, c'est l'estimation moins le temps écoulé ;
 * ensuite, la part déjà reçue donne la vitesse réelle de cet appel.
 */
export function tempsRestantDeLIa(dureeEstimeeMs: number, ecouleMs: number, tokensRecus: number, sortieEstimee: number): number {
  const part = sortieEstimee > 0 ? tokensRecus / sortieEstimee : 0;
  if (part >= 1) {
    return 0;
  }
  if (part < 0.2) {
    return Math.max(0, dureeEstimeeMs - ecouleMs);
  }
  return Math.max(0, (ecouleMs * (1 - part)) / part);
}
