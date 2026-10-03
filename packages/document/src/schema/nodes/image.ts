import { Node } from '@tiptap/core';

/**
 * Largeur d'une image : un pourcentage entier de la page, de 10 à 100. Sans
 * largeur, l'image prend toute la page. Trois tailles sont proposées d'un clic.
 */
export const largeurMinDImage = 10;
export const largeurMaxDImage = 100;
export const taillesDImage = [
  { nom: 'Petit', largeur: 33 },
  { nom: 'Moyen', largeur: 66 },
  { nom: 'Grand', largeur: 100 },
] as const;
export type ImageWidth = number;

/** Vrai pour une largeur que le fichier peut porter : un entier de 10 à 100. */
export function estLargeurDImage(valeur: unknown): valeur is ImageWidth {
  return typeof valeur === 'number' && Number.isInteger(valeur) && valeur >= largeurMinDImage && valeur <= largeurMaxDImage;
}

/** Alignements proposés. Sans alignement, l'image est centrée. */
export const alignementsDImage = ['gauche', 'centre', 'droite'] as const;
export type ImageAlign = (typeof alignementsDImage)[number];

export interface ImageAttributes {
  /** Adresse telle qu'écrite dans le fichier (encodée par markdown-it), sans le fragment des réglages. */
  src: string;
  /** Texte alternatif, en texte simple. */
  alt: string;
  /** Légende : le titre Markdown de l'image. null s'il n'y en a pas. */
  title: string | null;
  largeur: ImageWidth | null;
  alignement: ImageAlign | null;
}

/**
 * Image (README §6) : un paragraphe du fichier qui ne contient qu'une image
 * devient ce bloc. Une image au milieu du texte reste un bloc brut. Le rendu
 * à l'écran (adresse locale, visionneuse) est un affichage de l'application :
 * ici, seulement les attributs et une forme HTML pour le presse-papiers.
 */
export const Image = Node.create({
  name: 'image',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      src: { default: '', rendered: false },
      alt: { default: '', rendered: false },
      title: { default: null, rendered: false },
      largeur: { default: null, rendered: false },
      alignement: { default: null, rendered: false },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'figure[data-image]',
        getAttrs: (element) => {
          const image = element.querySelector('img');
          if (image === null) {
            return false;
          }
          const largeur = Number(element.getAttribute('data-largeur'));
          const alignement = element.getAttribute('data-alignement');
          return {
            src: image.getAttribute('src') ?? '',
            alt: image.getAttribute('alt') ?? '',
            title: element.querySelector('figcaption')?.textContent ?? null,
            largeur: estLargeurDImage(largeur) ? largeur : null,
            alignement: (alignementsDImage as readonly (string | null)[]).includes(alignement) ? alignement : null,
          };
        },
      },
    ];
  },

  // Forme HTML pour le presse-papiers et les rendus sans vue dédiée. Tout passe en attributs ou en texte, jamais en HTML.
  renderHTML({ node }) {
    const attributs = node.attrs as ImageAttributes;
    const figure: Record<string, string> = { 'data-image': '' };
    if (attributs.largeur !== null) {
      figure['data-largeur'] = String(attributs.largeur);
    }
    if (attributs.alignement !== null) {
      figure['data-alignement'] = attributs.alignement;
    }
    const image = ['img', { src: attributs.src, alt: attributs.alt }];
    return attributs.title === null ? ['figure', figure, image] : ['figure', figure, image, ['figcaption', {}, attributs.title]];
  },
});
