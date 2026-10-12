import { idDeLienInterne } from '@notes/document';
import type { ExportOutlineEntry } from '@notes/ui';

export interface CleanOptions {
  /** Garder les favicons des mentions de site (option « icônes » du PDF). */
  icones: boolean;
  /** Adresse dans l'archive de la page d'identifiant « id », ou null : la mention reste du texte. */
  lienVersLaPage: (id: string) => string | null;
  /** Adresse finale d'une image d'après celle du rendu (archive : chemin relatif). Absente : inchangée. */
  adresseDImage?: (src: string) => string;
}

/** Attributs de l'éditeur sans objet dans un document figé. */
const attributsDeLEditeur = ['as', 'contenteditable', 'draggable', 'spellcheck', 'translate', 'tabindex', 'data-node-view-wrapper', 'data-node-view-content-react'];

/** Seules adresses gardées sur un lien exporté : le web, la messagerie, les ancres de la page. */
const adresseSure = /^(https?:|mailto:|#)/i;

/** Ancre d'un titre : ses mots en minuscules, sans accents, reliés par des tirets. Rendue unique dans la page. */
export function ancreDuTitre(texte: string, prises: Set<string>): string {
  const base =
    texte
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'titre';
  let ancre = base;
  for (let numero = 2; prises.has(ancre); numero += 1) {
    ancre = `${base}-${numero}`;
  }
  prises.add(ancre);
  return ancre;
}

/** Remplace un élément par ses enfants. */
function deballer(element: Element): void {
  element.replaceWith(...element.childNodes);
}

/**
 * Le rendu de l'éditeur, prêt pour un fichier (docs/spec/export.md) : plus rien de
 * l'édition (attributs, poignées, images manquantes), un `thead` pour que
 * l'en-tête d'un tableau se répète d'une page à l'autre, des ancres sur les
 * titres, des liens limités au web et aux pages de l'archive.
 *
 * Travaille sur une copie : rend son HTML intérieur et le sommaire.
 */
export function nettoyerLeRendu(racine: HTMLElement, options: CleanOptions): { html: string; sommaire: ExportOutlineEntry[] } {
  const copie = racine.cloneNode(true) as HTMLElement;

  copie.querySelectorAll('.ProseMirror-separator, .ProseMirror-trailingBreak, .ProseMirror-gapcursor, .image-absente:empty, img[hidden], figcaption[hidden]').forEach((element) => element.remove());
  copie.querySelectorAll('.react-renderer').forEach(deballer);
  if (!options.icones) {
    copie.querySelectorAll('.mention-site-icone').forEach((element) => element.remove());
  }
  for (const element of [copie, ...copie.querySelectorAll('*')]) {
    for (const attribut of attributsDeLEditeur) {
      element.removeAttribute(attribut);
    }
    element.classList.remove('ProseMirror-widget', 'ProseMirror-selectednode', 'selectedCell');
    if (element.getAttribute('class') === '') {
      element.removeAttribute('class');
    }
  }
  const { adresseDImage } = options;
  if (adresseDImage !== undefined) {
    copie.querySelectorAll('img[src]').forEach((image) => image.setAttribute('src', adresseDImage(image.getAttribute('src') ?? '')));
  }
  // L'état coché d'une case est une propriété du DOM, que la copie ne sérialise pas : il est écrit en attribut, lu sur
  // l'original (la copie ne garde que les attributs). Pas de `disabled`, qui pâlit la case ; le CSS la rend inerte.
  const originales = [...racine.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
  copie.querySelectorAll('input[type="checkbox"]').forEach((caseACocher, index) => {
    if (originales[index]?.checked === true) {
      caseACocher.setAttribute('checked', '');
    } else {
      caseACocher.removeAttribute('checked');
    }
  });

  // Mentions de page : un lien vers la page dans l'archive, sinon du texte.
  copie.querySelectorAll('span.mention[data-mention]').forEach((mention) => {
    const adresse = options.lienVersLaPage(mention.getAttribute('data-mention') ?? '');
    if (adresse === null) {
      return;
    }
    const lien = mention.ownerDocument.createElement('a');
    for (const { name, value } of mention.attributes) {
      lien.setAttribute(name, value);
    }
    lien.setAttribute('href', adresse);
    lien.append(...mention.childNodes);
    mention.replaceWith(lien);
  });
  copie.querySelectorAll('a[href]').forEach((lien) => {
    const href = lien.getAttribute('href') ?? '';
    const interne = idDeLienInterne(href);
    if (interne !== null) {
      const adresse = options.lienVersLaPage(interne);
      if (adresse === null) {
        deballer(lien);
      } else {
        lien.setAttribute('href', adresse);
      }
    } else if (!adresseSure.test(href) && !lien.classList.contains('mention')) {
      lien.removeAttribute('href');
    }
  });

  // L'en-tête d'un tableau (sa première ligne) dans un thead : Chromium le répète en haut de chaque page imprimée.
  copie.querySelectorAll('table').forEach((tableau) => {
    const premiere = tableau.querySelector('tr');
    if (premiere !== null && premiere.querySelector('th') !== null && premiere.parentElement?.tagName !== 'THEAD') {
      const entete = tableau.ownerDocument.createElement('thead');
      entete.append(premiere);
      const corps = tableau.querySelector('tbody');
      if (corps === null) {
        tableau.prepend(entete);
      } else {
        corps.before(entete);
      }
    }
  });

  const prises = new Set<string>();
  const sommaire: ExportOutlineEntry[] = [];
  copie.querySelectorAll('h1, h2, h3, h4, h5').forEach((titre) => {
    const texte = (titre.textContent ?? '').trim();
    if (texte === '') {
      return;
    }
    const ancre = ancreDuTitre(texte, prises);
    titre.id = ancre;
    sommaire.push({ niveau: Number(titre.tagName.slice(1)), texte, ancre });
  });

  return { html: copie.innerHTML, sommaire };
}
