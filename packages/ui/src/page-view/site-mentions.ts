import type { AnyExtension, Mark as MarkExtension } from '@tiptap/core';
import type { Mark, Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/** Titre Markdown qui fait d'un lien une mention de site : `[Titre](https://exemple.fr "mention")`. */
export const titreDeMentionDeSite = 'mention';

export interface SiteMentionOptions {
  /** Adresse à charger pour la favicon du site de ce lien, gardée dans le dossier des notes. null : un globe. */
  favicon?: (href: string) => string | null;
}

/** Vrai pour une marque de lien qui est une mention de site. */
export function estMentionDeSite(marque: Mark): boolean {
  return marque.type.name === 'link' && marque.attrs['title'] === titreDeMentionDeSite;
}

const svg = 'http://www.w3.org/2000/svg';

/** Un globe dessiné à la main (même tracé que l'icône Lucide), quand le site n'a pas de favicon gardée. */
function globe(): SVGSVGElement {
  const dessin = document.createElementNS(svg, 'svg');
  dessin.setAttribute('viewBox', '0 0 24 24');
  dessin.setAttribute('fill', 'none');
  dessin.setAttribute('stroke', 'currentColor');
  dessin.setAttribute('stroke-width', '2');
  for (const [nom, attributs] of [
    ['circle', { cx: '12', cy: '12', r: '10' }],
    ['path', { d: 'M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20' }],
    ['path', { d: 'M2 12h20' }],
  ] as const) {
    const trait = document.createElementNS(svg, nom);
    for (const [cle, valeur] of Object.entries(attributs)) {
      trait.setAttribute(cle, valeur);
    }
    dessin.append(trait);
  }
  return dessin;
}

/** Luminance (0 noir, 1 blanc) d'une couleur CSS `#rrggbb`, null pour une autre écriture. */
function luminance(couleur: string): number | null {
  const morceaux = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(couleur.trim());
  if (morceaux === null) {
    return null;
  }
  const [r, v, b] = morceaux.slice(1).map((hexa) => Number.parseInt(hexa, 16) / 255) as [number, number, number];
  return 0.2126 * r + 0.7152 * v + 0.0722 * b;
}

/** Luminance moyenne des pixels visibles d'une image chargée, null si on ne peut pas la lire. */
function luminanceDeLImage(image: HTMLImageElement): number | null {
  const cote = 16;
  const toile = window.document.createElement('canvas');
  toile.width = cote;
  toile.height = cote;
  const contexte = toile.getContext('2d', { willReadFrequently: true });
  if (contexte === null) {
    return null;
  }
  try {
    contexte.drawImage(image, 0, 0, cote, cote);
    const pixels = contexte.getImageData(0, 0, cote, cote).data;
    let somme = 0;
    let poids = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const opacite = (pixels[i + 3] ?? 0) / 255;
      somme += opacite * (0.2126 * (pixels[i] ?? 0) + 0.7152 * (pixels[i + 1] ?? 0) + 0.0722 * (pixels[i + 2] ?? 0)) / 255;
      poids += opacite;
    }
    return poids < 1 ? null : somme / poids;
  } catch {
    // Image d'une autre origine sans CORS : ses pixels ne se lisent pas, elle reste telle quelle.
    return null;
  }
}

/**
 * Une favicon sombre sur une page sombre (le logo noir de GitHub sur le thème par défaut) se voit
 * mal : elle reçoit un fond blanc. Sur une page claire, rien ne change.
 */
function eclaircirSiSombre(image: HTMLImageElement, icone: HTMLElement): void {
  const fond = luminance(window.getComputedStyle(icone).getPropertyValue('--color-fond'));
  const favicon = luminanceDeLImage(image);
  if (fond !== null && favicon !== null && fond < 0.5 && favicon < 0.35) {
    icone.classList.add('mention-site-icone-claire');
  }
}

/** Les mentions de site d'un document : début de chaque lien au titre « mention », avec sa marque. */
function mentionsDeSite(document: ProseMirrorNode): { position: number; marque: Mark }[] {
  const trouvees: { position: number; marque: Mark }[] = [];
  let precedente: { fin: number; marque: Mark } | null = null;
  document.descendants((noeud, position) => {
    if (!noeud.isText) {
      return;
    }
    const marque = noeud.marks.find(estMentionDeSite);
    if (marque !== undefined && !(precedente !== null && precedente.fin === position && precedente.marque.eq(marque))) {
      trouvees.push({ position, marque });
    }
    precedente = marque === undefined ? null : { fin: position + noeud.nodeSize, marque };
  });
  return trouvees;
}

function decorations(document: ProseMirrorNode, options: SiteMentionOptions): DecorationSet {
  return DecorationSet.create(
    document,
    mentionsDeSite(document).map(({ position, marque }) => {
      const href = String(marque.attrs['href']);
      const adresse = options.favicon?.(href) ?? null;
      return Decoration.widget(
        position,
        () => {
          const icone = window.document.createElement('span');
          icone.className = 'mention-site-icone';
          icone.contentEditable = 'false';
          if (adresse === null) {
            icone.append(globe());
          } else {
            const image = window.document.createElement('img');
            image.alt = '';
            image.draggable = false;
            // Pixels lisibles (fond clair derrière une favicon sombre) : le main sert les images avec CORS.
            image.crossOrigin = 'anonymous';
            image.addEventListener('load', () => eclaircirSiSombre(image, icone));
            image.src = adresse;
            // Favicon absente du dossier des notes : le globe à sa place, rien n'est cherché sur Internet.
            image.addEventListener('error', () => image.replaceWith(globe()));
            icone.append(image);
          }
          return icone;
        },
        { side: -1, marks: [marque], key: `favicon:${href}:${adresse ?? ''}`, ignoreSelection: true },
      );
    }),
  );
}

/**
 * Le lien du schéma, avec les mentions de site (docs/spec/editeur.md) : un lien au titre
 * « mention » s'affiche en puce, favicon devant, sans l'infobulle « mention »
 * du navigateur. Il le reste au copier-coller (`data-mention-site`).
 */
export function lienAvecMentionsDeSite(lien: AnyExtension, options: SiteMentionOptions) {
  return (lien as MarkExtension).extend({
    addAttributes() {
      const parent = (this.parent?.() ?? {}) as Record<string, object>;
      return {
        ...parent,
        title: {
          default: null,
          parseHTML: (element: HTMLElement) => element.getAttribute('title') ?? (element.hasAttribute('data-mention-site') ? titreDeMentionDeSite : null),
        },
      };
    },
    renderHTML({ mark, HTMLAttributes }) {
      if (mark.attrs['title'] !== titreDeMentionDeSite) {
        return ['a', HTMLAttributes, 0];
      }
      const { title: _title, ...autres } = HTMLAttributes as Record<string, unknown>;
      return ['a', { ...autres, class: 'mention-site', 'data-mention-site': '' }, 0];
    },
    addProseMirrorPlugins() {
      return [
        ...(this.parent?.() ?? []),
        new Plugin({
          key: new PluginKey('mentionsDeSite'),
          state: {
            init: (_config, etat) => decorations(etat.doc, options),
            apply: (transaction, ancien) => (transaction.docChanged ? decorations(transaction.doc, options) : ancien),
          },
          props: {
            decorations(etat) {
              return this.getState(etat);
            },
          },
        }),
      ];
    },
  });
}
