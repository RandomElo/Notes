import { parseDocument } from 'htmlparser2';
import type { ChildNode, Element } from 'domhandler';

/*
 * Lecture du HTML d'un export Notion (docs/spec/import-notion.md). Le HTML est
 * analysé en arbre, jamais interprété ni injecté : seuls les noms de balises,
 * quelques attributs et le texte en sortent.
 */

export type { ChildNode, Element };

export function lireHtml(html: string): ChildNode[] {
  return parseDocument(html, { decodeEntities: true }).children;
}

export function estElement(noeud: ChildNode | undefined): noeud is Element {
  return noeud !== undefined && (noeud.type === 'tag' || noeud.type === 'script' || noeud.type === 'style');
}

export function estTexte(noeud: ChildNode): noeud is ChildNode & { data: string } {
  return noeud.type === 'text';
}

export function classes(element: Element): string[] {
  return (element.attribs['class'] ?? '').split(/\s+/).filter((classe) => classe !== '');
}

export function aLaClasse(element: Element, classe: string): boolean {
  return classes(element).includes(classe);
}

export function enfantsElements(element: Element): Element[] {
  return element.children.filter(estElement);
}

/** Premier élément, en profondeur, qui vérifie le test. */
export function trouver(noeuds: readonly ChildNode[], test: (element: Element) => boolean): Element | null {
  for (const noeud of noeuds) {
    if (!estElement(noeud)) {
      continue;
    }
    if (test(noeud)) {
      return noeud;
    }
    const dedans = trouver(noeud.children, test);
    if (dedans !== null) {
      return dedans;
    }
  }
  return null;
}

/** Tous les éléments, en profondeur, qui vérifient le test (sans descendre dans ceux trouvés). */
export function trouverTous(noeuds: readonly ChildNode[], test: (element: Element) => boolean, trouves: Element[] = []): Element[] {
  for (const noeud of noeuds) {
    if (!estElement(noeud)) {
      continue;
    }
    if (test(noeud)) {
      trouves.push(noeud);
    } else {
      trouverTous(noeud.children, test, trouves);
    }
  }
  return trouves;
}

/** Texte d'un nœud, sans les icônes ni les dessins, espaces resserrées. */
export function texteDe(noeud: ChildNode): string {
  return texteBrut(noeud).replace(/\s+/g, ' ').trim();
}

function texteBrut(noeud: ChildNode): string {
  if (estTexte(noeud)) {
    return noeud.data;
  }
  if (!estElement(noeud) || noeud.name === 'svg' || noeud.name === 'script' || noeud.name === 'style' || aLaClasse(noeud, 'icon')) {
    return '';
  }
  if (noeud.name === 'br') {
    return '\n';
  }
  return noeud.children.map(texteBrut).join('');
}
