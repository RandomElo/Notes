/**
 * Icône d'une page (README §6), clé `icon` du front-matter. Trois formes,
 * lisibles sans l'application :
 * - un emoji, écrit tel quel (`icon: 📚`) ;
 * - un nom d'icône Lucide en kebab-case (`icon: book-open`) ;
 * - une image du dossier `assets/` de la page (`icon: assets/icone.webp`).
 */
export type PageIcon = { genre: 'emoji'; emoji: string } | { genre: 'lucide'; nom: string } | { genre: 'image'; src: string };

const nomLucide = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const imageDeLaPage = /^assets\/[^/\\]+\.(?:webp|png|jpe?g|gif|avif|svg)$/i;
const longueurMax = 120;

/** Forme d'une valeur de la clé `icon`, ou null si elle n'en a aucune (l'icône par défaut s'affiche alors). */
export function natureDIcone(valeur: string | null | undefined): PageIcon | null {
  const icone = valeur?.trim() ?? '';
  if (icone === '' || icone.length > longueurMax || /[\n\r]/.test(icone)) {
    return null;
  }
  if (imageDeLaPage.test(icone) && !icone.includes('..')) {
    return { genre: 'image', src: icone };
  }
  if (nomLucide.test(icone)) {
    return { genre: 'lucide', nom: icone };
  }
  // Un emoji : au moins un caractère hors ASCII, court, sans espace.
  return /\P{ASCII}/u.test(icone) && icone.length <= 16 && !/\s/.test(icone) ? { genre: 'emoji', emoji: icone } : null;
}
