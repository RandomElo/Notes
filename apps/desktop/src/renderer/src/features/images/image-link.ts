import { aUneExtensionDImage } from '@notes/core';

/**
 * Le lien d'une image d'Internet, si le texte collé n'est que cela :
 * `https://exemple.fr/schema.png`, éventuellement suivi de paramètres. null
 * pour tout autre texte, qui se colle normalement.
 */
export function lienDImage(texte: string): string | null {
  const adresse = texte.trim();
  if (!/^https?:\/\/\S+$/i.test(adresse)) {
    return null;
  }
  try {
    const url = new URL(adresse);
    const nom = decodeURIComponent(url.pathname.split('/').pop() ?? '');
    return aUneExtensionDImage(nom) ? adresse : null;
  } catch {
    return null;
  }
}
