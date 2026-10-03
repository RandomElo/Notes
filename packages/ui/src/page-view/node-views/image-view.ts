import { Image as BlocImage } from '@notes/document';
import type { ImageAttributes } from '@notes/document';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { NodeView } from '@tiptap/pm/view';

export interface ImageViewOptions {
  /** Adresse à charger pour l'image d'adresse « src » dans la page, ou null si elle ne s'affiche pas. */
  resoudre: (src: string) => string | null;
  /** Ouvre l'image en grand (double-clic). Absent : pas de visionneuse. */
  agrandir?: (attributs: ImageAttributes, adresse: string) => void;
}

/**
 * Vue d'un bloc image : l'image à sa largeur et à sa place, sa légende
 * dessous. L'adresse vient de l'application (« resoudre ») : le fichier ne
 * choisit jamais ce qui est chargé. Tout le texte venu du fichier est posé
 * comme texte, jamais comme HTML.
 */
class ImageNodeView implements NodeView {
  dom: HTMLElement;
  private image: HTMLImageElement;
  private legende: HTMLElement;
  private absence: HTMLElement;
  private noeud: ProseMirrorNode;

  constructor(noeud: ProseMirrorNode, private readonly options: ImageViewOptions) {
    this.noeud = noeud;
    this.dom = document.createElement('figure');
    this.dom.setAttribute('data-image', '');
    this.image = document.createElement('img');
    this.image.draggable = false;
    this.image.decoding = 'async';
    this.absence = document.createElement('div');
    this.absence.className = 'image-absente';
    this.legende = document.createElement('figcaption');
    this.dom.append(this.image, this.absence, this.legende);
    this.image.addEventListener('error', () => this.montrerAbsence(`Image introuvable : ${this.attributs.src}`));
    this.image.addEventListener('load', () => this.absence.replaceChildren());
    this.dom.addEventListener('dblclick', (evenement) => {
      const adresse = this.options.resoudre(this.attributs.src);
      if (adresse !== null && this.options.agrandir !== undefined) {
        evenement.preventDefault();
        this.options.agrandir(this.attributs, adresse);
      }
    });
    this.afficher();
  }

  private get attributs(): ImageAttributes {
    return this.noeud.attrs as ImageAttributes;
  }

  private montrerAbsence(texte: string): void {
    this.image.hidden = true;
    this.absence.textContent = texte;
  }

  private afficher(): void {
    const { src, alt, title, largeur, alignement } = this.attributs;
    this.dom.setAttribute('data-largeur', String(largeur ?? 100));
    // Un entier de 10 à 100, vérifié à la lecture du fichier : rien d'autre n'arrive dans le style.
    this.dom.style.setProperty('--largeur-image', `${largeur ?? 100}%`);
    this.dom.setAttribute('data-alignement', alignement ?? 'centre');
    this.image.alt = alt;
    this.legende.textContent = title ?? '';
    this.legende.hidden = title === null || title === '';
    const adresse = this.options.resoudre(src);
    if (adresse === null) {
      this.montrerAbsence(/^https?:/i.test(src) ? `Image d'Internet non affichée : ${src}` : `Image non affichée : ${src}`);
      this.image.removeAttribute('src');
      return;
    }
    this.image.hidden = false;
    this.absence.replaceChildren();
    if (this.image.getAttribute('src') !== adresse) {
      this.image.src = adresse;
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

  // La vue gère seule ses changements : l'image ne se recharge pas pour rien.
  ignoreMutation(): boolean {
    return true;
  }

  stopEvent(evenement: Event): boolean {
    return evenement.type === 'dblclick';
  }
}

/** Le bloc image du schéma, avec sa vue. */
export function imageAvecVue(options: ImageViewOptions) {
  return BlocImage.extend({
    addNodeView() {
      return ({ node }) => new ImageNodeView(node, options);
    },
  });
}
