import { Node } from '@tiptap/core';

/** Préfixe des liens internes : `notes://` suivi de l'identifiant de la page. */
export const prefixeDeLienInterne = 'notes://';

const cibleDeMention = /^notes:\/\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** Identifiant de la page visée par une adresse `notes://uuid`, en minuscules, ou null. */
export function idDeLienInterne(adresse: string): string | null {
  return cibleDeMention.exec(adresse.trim())?.[1]?.toLowerCase() ?? null;
}

export interface PageMentionAttributes {
  /** Identifiant de la page mentionnée. */
  id: string;
  /** Texte du lien dans le fichier. L'affichage montre le titre courant de la page, pas ce texte. */
  libelle: string;
  /** Titre Markdown du lien, rare, gardé pour ne rien perdre. */
  title: string | null;
}

/**
 * Mention d'une page (README §6) : dans le fichier, un lien Markdown standard
 * `[Titre](notes://uuid)`. À l'écran, l'icône et le titre courant de la page,
 * résolus par l'application ; ici, seulement les attributs et une forme HTML
 * pour le presse-papiers. Un lien `notes://` dont le texte est mis en forme
 * reste un lien ordinaire.
 */
export const PageMention = Node.create({
  name: 'pageMention',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      id: { default: '', rendered: false },
      libelle: { default: '', rendered: false },
      title: { default: null, rendered: false },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'a[data-mention]',
        getAttrs: (element) => {
          const id = idDeLienInterne(element.getAttribute('href') ?? '');
          return id === null ? false : { id, libelle: element.textContent ?? '', title: element.getAttribute('title') };
        },
      },
    ];
  },

  renderHTML({ node }) {
    const attributs = node.attrs as PageMentionAttributes;
    return ['a', { href: prefixeDeLienInterne + attributs.id, 'data-mention': '' }, attributs.libelle];
  },

  renderText({ node }) {
    return String(node.attrs['libelle']);
  },
});
