/**
 * Liens externes (docs/spec/stockage.md) : une adresse collée seule devient un lien dont
 * le texte est l'adresse nettoyée, `https://www.google.com/` devenant
 * `google.com`.
 */

const adresseWeb = /^(https?:\/\/|mailto:)[^\s<>"]+$/i;

/** Vrai pour un texte qui n'est qu'une adresse web ou de courriel, sans espace. */
export function estAdresseWeb(texte: string): boolean {
  return adresseWeb.test(texte.trim());
}

/** Texte affiché pour un lien vers cette adresse : sans protocole, sans `www.`, sans barre finale. */
export function libelleDAdresse(adresse: string): string {
  const nettoye = adresse
    .trim()
    .replace(/^(https?:\/\/|mailto:)/i, '')
    .replace(/^www\./i, '')
    .replace(/\/$/, '');
  return nettoye === '' ? adresse.trim() : nettoye;
}
