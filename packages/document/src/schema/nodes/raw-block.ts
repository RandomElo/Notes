import { Node } from '@tiptap/core';

/**
 * Bloc brut : du Markdown que le schéma ne sait pas encore représenter
 * (tableau, image, titre de niveau 6, définition de lien...). Son texte est
 * gardé tel quel, affiché sans mise en forme et réécrit à l'identique. Il n'est
 * pas modifiable dans l'éditeur.
 */
export const RawBlock = Node.create({
  name: 'rawBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      // Le texte Markdown d'origine, fins de ligne comprises.
      source: { default: '', rendered: false },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'pre[data-raw-block]',
        // Avant la règle du bloc de code, qui prend tous les <pre>.
        priority: 100,
        getAttrs: (element) => ({ source: element.textContent ?? '' }),
      },
    ];
  },

  // Rendu en texte, jamais en HTML : ce contenu vient du disque (règle 6).
  renderHTML({ node }) {
    return ['pre', { 'data-raw-block': '', title: 'Bloc non modifiable ici, gardé tel quel dans le fichier' }, String(node.attrs['source'])];
  },
});
