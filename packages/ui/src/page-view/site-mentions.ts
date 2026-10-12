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
