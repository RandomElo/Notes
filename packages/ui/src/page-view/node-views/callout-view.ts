import { Callout, iconeDuCallout, typeDuCallout } from '@notes/document';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { NodeView, ViewMutationRecord } from '@tiptap/pm/view';

/**
 * Vue d'un callout : l'icône, puis le contenu modifiable. L'icône est hors du
 * contenu : ses changements d'affichage ne doivent pas faire relire le texte
 * par ProseMirror, qui transformerait au passage ce qu'il relit autour (un
 * saut de ligne devenait un saut forcé dans une citation voisine).
 */
class CalloutNodeView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  private icone: HTMLElement;
  private noeud: ProseMirrorNode;

  constructor(noeud: ProseMirrorNode) {
    this.noeud = noeud;
    this.dom = document.createElement('div');
    this.dom.setAttribute('data-callout', '');
    this.icone = document.createElement('span');
    this.icone.className = 'callout-icone';
    this.icone.contentEditable = 'false';
    this.icone.setAttribute('aria-hidden', 'true');
    this.contentDOM = document.createElement('div');
    this.contentDOM.className = 'callout-contenu';
    this.dom.append(this.icone, this.contentDOM);
    this.afficher();
  }

  private afficher(): void {
    this.dom.setAttribute('data-type', typeDuCallout(this.noeud.attrs['type']));
    // L'icône vient du fichier : posée comme texte, jamais comme HTML.
    const icone = iconeDuCallout(this.noeud.attrs as { type: unknown; icon: unknown });
    if (this.icone.textContent !== icone) {
      this.icone.textContent = icone;
    }
  }

  update(noeud: ProseMirrorNode): boolean {
    if (noeud.type !== this.noeud.type) {
      return false;
    }
    this.noeud = noeud;
    this.afficher();
    return true;
  }

  ignoreMutation(mutation: ViewMutationRecord): boolean {
    return mutation.type !== 'selection' && !this.contentDOM.contains(mutation.target);
  }
}

/** Le callout du schéma, avec sa vue. */
export const CalloutAvecVue = Callout.extend({
  addNodeView() {
    return ({ node }) => new CalloutNodeView(node);
  },
});
