/**
 * Textes des fonctions IA : montants, tokens, durées. Les montants sont en
 * dollars, la monnaie de facturation d'OpenAI.
 */

const nombre = new Intl.NumberFormat('fr-FR');

/** « 1 240 tokens ». */
export function libelleDeTokens(tokens: number): string {
  return `${nombre.format(Math.round(tokens))} token${Math.round(tokens) > 1 ? 's' : ''}`;
}

/**
 * Un montant en dollars, assez précis pour les petites sommes : « 0,0026 $ »,
 * « 0,12 $ », « 3,40 $ ». Zéro s'écrit « 0 $ ».
 */
export function libelleDeDollars(montant: number): string {
  if (montant === 0) {
    return '0 $';
  }
  const chiffres = montant >= 1 ? 2 : montant >= 0.01 ? 3 : 4;
  const texte = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: montant >= 1 ? 2 : 0, maximumFractionDigits: chiffres }).format(montant);
  return `${texte === '0' ? '< 0,0001' : texte} $`;
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
