import { cheminDeFavicon, natureDIcone } from '@notes/core';
import type { TreeNode } from '@notes/core';
import { lireMarkdown } from '@notes/document';
import { cheminDeLImage, estMentionDeSite } from '@notes/ui';
import type { MentionedPage } from '@notes/ui';

/** Des octets en adresse `data:` (base64), par morceaux pour ne pas dépasser la pile avec une grande image. */
export function versDataUri(octets: Uint8Array, type: string): string {
  let binaire = '';
  for (let debut = 0; debut < octets.length; debut += 0x8000) {
    binaire += String.fromCharCode(...octets.subarray(debut, debut + 0x8000));
  }
  return `data:${type};base64,${btoa(binaire)}`;
}

/** Chemin, dans le dossier des notes, de l'icône image d'une page (`assets/icone.webp` de son dossier), ou null. */
export function cheminDeLIcone(icone: string | null, dossierDeLaPage: string): string | null {
  const nature = natureDIcone(icone);
  return nature?.genre === 'image' ? cheminDeLImage(dossierDeLaPage, nature.src) : null;
}

/** Chemin de la favicon gardée pour le site d'un lien, ou null. */
export function cheminDeLaFavicon(href: string): string | null {
  try {
    return cheminDeFavicon(new URL(href).hostname);
  } catch {
    return null;
  }
}

/** Ce qu'une page montre et qu'un export doit emporter : ses images, et avec les icônes, celles des mentions et des sites. */
export function imagesAEmporter(corps: string, noeud: TreeNode, dossierDeLaPage: string, avecIcones: boolean, page: (id: string) => MentionedPage | null): string[] {
  const chemins = new Set<string>();
  const ajouter = (chemin: string | null): void => {
    if (chemin !== null) {
      chemins.add(chemin);
    }
  };
  if (avecIcones) {
    ajouter(cheminDeLIcone(noeud.icone, dossierDeLaPage));
  }
  lireMarkdown(corps).document.descendants((element) => {
    if (element.type.name === 'image') {
      ajouter(cheminDeLImage(dossierDeLaPage, String(element.attrs['src'])));
    } else if (avecIcones && element.type.name === 'pageMention') {
      const mentionnee = page(String(element.attrs['id']));
      ajouter(mentionnee === null ? null : cheminDeLIcone(mentionnee.icone, mentionnee.chemin));
    } else if (avecIcones && element.isText) {
      const lien = element.marks.find(estMentionDeSite);
      ajouter(lien === undefined ? null : cheminDeLaFavicon(String(lien.attrs['href'])));
    }
  });
  return [...chemins];
}
