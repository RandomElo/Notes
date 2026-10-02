import { InputRule } from '@tiptap/core';
import { BulletList as ListeAPuces, OrderedList as ListeOrdonnee, TaskItem, TaskList as ListeDeTaches } from '@tiptap/extension-list';

/**
 * Markdown distingue les listes serrées (items collés) des listes aérées (une
 * ligne vide entre les items). L'attribut « tight » garde ce choix pour qu'une
 * liste modifiée soit réécrite comme elle était.
 */
const serree = { tight: { default: true, rendered: false } };

export const BulletList = ListeAPuces.extend({
  addAttributes() {
    return { ...this.parent?.(), ...serree };
  },
});

export const OrderedList = ListeOrdonnee.extend({
  addAttributes() {
    return { ...this.parent?.(), ...serree };
  },
});

export const TaskList = ListeDeTaches.extend({
  addAttributes() {
    return { ...this.parent?.(), ...serree };
  },
});

/** `[ ]`, `[]` ou `[x]` suivi d'une espace, en début de bloc. */
const caseEnDebutDePuce = /^\s*\[([ x])?\]\s$/;

/**
 * Une tâche peut contenir une sous-liste, comme une puce. Et comme en Markdown
 * on écrit `- [ ] tâche`, taper la case au début d'une puce en fait une tâche :
 * sans cette règle, TipTap ne reconnaît la case qu'en dehors d'une liste.
 */
export const NestedTaskItem = TaskItem.extend({
  addInputRules() {
    const depuisUnePuce = new InputRule({
      find: caseEnDebutDePuce,
      handler: ({ state, range, match, chain }) => {
        const debut = state.doc.resolve(range.from);
        const dansUnePuce =
          debut.depth >= 2 && debut.node(-1).type.name === 'listItem' && debut.index(-1) === 0 && debut.node(-2).type.name === 'bulletList';
        if (!dansUnePuce) {
          return null;
        }
        chain()
          .deleteRange(range)
          .toggleList('taskList', this.name)
          .updateAttributes(this.name, { checked: match[1] === 'x' })
          .run();
        return undefined;
      },
    });
    return [depuisUnePuce, ...(this.parent?.() ?? [])];
  },
}).configure({
  nested: true,
  // Libellé lu par les lecteurs d'écran à la place de la case : en français, comme le reste de l'interface.
  a11y: { checkboxLabel: (noeud, cochee) => `${cochee ? 'Tâche faite' : 'Tâche à faire'} : ${noeud.textContent || 'sans texte'}` },
});
