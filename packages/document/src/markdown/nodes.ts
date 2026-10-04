import type { Mark, Node as ProseMirrorNode } from '@tiptap/pm/model';
import { niveauxDeTitre, schema } from '../schema/extensions';
import { langageDuCallout, lireCallout } from './callout';
import { idDeLienInterne } from '../schema/nodes/page-mention';
import { attributsDImage } from './image';
import type { Jeton } from './tokenizer';

/** Levée quand un bloc contient quelque chose que le schéma ne représente pas : il devient un bloc brut. */
export class UnsupportedMarkdown extends Error {}

const caseDeTache = /^\[([ xX])\](?:[ \t]+|$)/;

interface Cadre {
  type: string;
  attributs: Record<string, unknown>;
  contenu: ProseMirrorNode[];
  /** Pour une liste à puces : vrai si tous ses items commencent par une case à cocher. */
  taches?: boolean;
}

const marques: Record<string, string> = { strong: 'bold', em: 'italic', s: 'strike', mark: 'highlight', u: 'underline' };

/** Convertit les jetons d'un bloc de premier niveau en nœuds du schéma. */
export function convertirJetons(jetons: Jeton[]): ProseMirrorNode[] {
  const racine: Cadre = { type: 'doc', attributs: {}, contenu: [] };
  const pile: Cadre[] = [racine];
  const sommet = (): Cadre => pile[pile.length - 1] as Cadre;
  const ouvrir = (type: string, attributs: Record<string, unknown> = {}, taches?: boolean): void => {
    pile.push({ type, attributs, contenu: [], ...(taches === undefined ? {} : { taches }) });
  };
  const fermer = (): void => {
    const cadre = pile.pop() as Cadre;
    sommet().contenu.push(creer(cadre.type, cadre.attributs, cadre.contenu));
  };

  // Jetons déjà traités avec le précédent (paragraphe qui ne contient qu'une image).
  let sauterJusque = -1;
  jetons.forEach((jeton, index) => {
    if (index <= sauterJusque) {
      return;
    }
    switch (jeton.type) {
      case 'paragraph_open': {
        const image = imageSeule(jetons[index + 1]);
        // Le premier paragraphe d'un item est son texte : une image n'y devient pas un bloc.
        const parent = sommet();
        if (image !== null && !((parent.type === 'listItem' || parent.type === 'taskItem') && parent.contenu.length === 0)) {
          parent.contenu.push(creer('image', { ...attributsDImage(image) }));
          sauterJusque = index + 2;
          return;
        }
        return ouvrir('paragraph');
      }
      case 'heading_open': {
        const niveau = Number(jeton.tag.slice(1));
        if (!(niveauxDeTitre as readonly number[]).includes(niveau)) {
          throw new UnsupportedMarkdown();
        }
        return ouvrir('heading', { level: niveau });
      }
      case 'blockquote_open':
        return ouvrir('blockquote');
      case 'bullet_list_open': {
        const taches = estListeDeTaches(jetons, index);
        return ouvrir(taches ? 'taskList' : 'bulletList', { tight: estSerree(jetons, index) }, taches);
      }
      case 'ordered_list_open':
        return ouvrir('orderedList', { start: Number(jeton.attrGet('start') ?? 1), tight: estSerree(jetons, index) });
      case 'list_item_open': {
        if (sommet().taches !== true) {
          return ouvrir('listItem');
        }
        const coche = caseDeTache.exec(jetons[index + 2]?.content ?? '')?.[1];
        return ouvrir('taskItem', { checked: coche === 'x' || coche === 'X' });
      }
      case 'table_open':
        return ouvrir('table');
      case 'tr_open':
        return ouvrir('tableRow');
      case 'th_open':
      case 'td_open': {
        // Une cellule de markdown-it contient directement son texte : le schéma veut un paragraphe.
        ouvrir(jeton.type === 'th_open' ? 'tableHeader' : 'tableCell', { align: alignementDe(jeton) });
        return ouvrir('paragraph');
      }
      case 'th_close':
      case 'td_close':
        fermer();
        return fermer();
      case 'thead_open':
      case 'thead_close':
      case 'tbody_open':
      case 'tbody_close':
        return;
      case 'tr_close':
      case 'table_close':
      case 'paragraph_close':
      case 'heading_close':
      case 'blockquote_close':
      case 'bullet_list_close':
      case 'ordered_list_close':
      case 'list_item_close':
        return fermer();
      case 'inline': {
        // Le premier paragraphe d'une tâche commence par sa case, qui n'est pas du texte.
        const parent = pile[pile.length - 2];
        const sansCase = parent?.type === 'taskItem' && parent.contenu.length === 0;
        sommet().contenu.push(...convertirEnLigne(jeton.children ?? [], sansCase));
        return;
      }
      case 'hr':
        sommet().contenu.push(creer('horizontalRule'));
        return;
      case 'fence':
      case 'code_block': {
        const langage = jeton.type === 'fence' ? jeton.info.trim() : '';
        const callout = langage === langageDuCallout ? lireCallout(jeton.content, convertirJetons) : null;
        if (callout !== null) {
          sommet().contenu.push(creer('callout', { type: callout.type, icon: callout.icon }, callout.paragraphes));
          return;
        }
        const texte = jeton.content.replace(/\n$/, '');
        sommet().contenu.push(creer('codeBlock', { language: langage === '' ? null : langage }, texte === '' ? [] : [schema.text(texte)]));
        return;
      }
      default:
        throw new UnsupportedMarkdown();
    }
  });

  if (pile.length !== 1) {
    throw new UnsupportedMarkdown();
  }
  return racine.contenu;
}

/** Crée un nœud en vérifiant son contenu. Un item de liste vide reçoit son paragraphe vide. */
function creer(type: string, attributs: Record<string, unknown> = {}, contenu: ProseMirrorNode[] = []): ProseMirrorNode {
  const typeDeNoeud = schema.nodes[type];
  if (typeDeNoeud === undefined) {
    throw new UnsupportedMarkdown();
  }
  try {
    const noeud = contenu.length === 0 ? typeDeNoeud.createAndFill(attributs) : typeDeNoeud.createChecked(attributs, contenu);
    if (noeud === null) {
      throw new UnsupportedMarkdown();
    }
    return noeud;
  } catch {
    throw new UnsupportedMarkdown();
  }
}

/** Le jeton image d'un contenu en ligne qui n'est fait que d'une image, ou null. */
function imageSeule(jeton: Jeton | undefined): Jeton | null {
  const enfants = jeton?.type === 'inline' ? (jeton.children ?? []) : [];
  return enfants.length === 1 && enfants[0]?.type === 'image' ? enfants[0] : null;
}

/** Alignement d'une cellule, écrit par markdown-it dans son style (`text-align:center`). */
function alignementDe(jeton: Jeton): string | null {
  const alignement = /text-align:(left|center|right)/.exec(jeton.attrGet('style') ?? '')?.[1];
  return alignement ?? null;
}

/** Jetons des items directs d'une liste ouverte à « index » : pour chacun, l'index de son ouverture. */
function itemsDirects(jetons: Jeton[], index: number): number[] {
  const niveau = (jetons[index] as Jeton).level;
  const items: number[] = [];
  for (let i = index + 1; i < jetons.length; i++) {
    const jeton = jetons[i] as Jeton;
    if (jeton.level === niveau) {
      break;
    }
    if (jeton.type === 'list_item_open' && jeton.level === niveau + 1) {
      items.push(i);
    }
  }
  return items;
}

/** Une liste à puces est une liste de tâches si chaque item commence par `[ ]` ou `[x]`. */
function estListeDeTaches(jetons: Jeton[], index: number): boolean {
  const items = itemsDirects(jetons, index);
  return (
    items.length > 0 &&
    items.every((item) => {
      const texte = jetons[item + 2];
      const premier = texte?.children?.[0];
      return (
        jetons[item + 1]?.type === 'paragraph_open' &&
        texte?.type === 'inline' &&
        caseDeTache.test(texte.content) &&
        // La case doit être du texte simple : `\[ \]` n'en est pas une.
        premier?.type === 'text' &&
        /^\[[ xX]\]/.test(premier.content)
      );
    })
  );
}

/** markdown-it masque les paragraphes des items d'une liste serrée. */
function estSerree(jetons: Jeton[], index: number): boolean {
  return itemsDirects(jetons, index).every((item) => {
    const suivant = jetons[item + 1];
    return suivant?.type !== 'paragraph_open' || suivant.hidden;
  });
}

function convertirEnLigne(jetons: Jeton[], sansCase: boolean): ProseMirrorNode[] {
  let actives: readonly Mark[] = [];
  const noeuds: ProseMirrorNode[] = [];
  const texte = (contenu: string, marquesDuTexte: readonly Mark[] = actives): void => {
    if (contenu !== '') {
      noeuds.push(schema.text(contenu, marquesDuTexte));
    }
  };
  const marque = (nom: string, attributs?: Record<string, unknown>): Mark => {
    const type = schema.marks[nom];
    if (type === undefined) {
      throw new UnsupportedMarkdown();
    }
    return type.create(attributs);
  };

  let debut = 0;
  if (sansCase) {
    // Retire « [ ] » du premier texte, et le retour à la ligne qui le suivrait.
    const premier = jetons[0] as Jeton;
    const reste = premier.content.replace(/^\[[ xX]\][ \t]*/, '');
    texte(reste);
    debut = reste === '' && jetons[1]?.type === 'softbreak' ? 2 : 1;
  }

  for (let index = debut; index < jetons.length; index++) {
    const jeton = jetons[index] as Jeton;
    switch (jeton.type) {
      case 'text':
        texte(jeton.content);
        break;
      case 'softbreak':
        texte('\n');
        break;
      case 'hardbreak':
        noeuds.push(creer('hardBreak'));
        break;
      case 'code_inline':
        texte(jeton.content, marque('code').addToSet(actives));
        break;
      case 'strong_open':
      case 'em_open':
      case 's_open':
      case 'mark_open':
      case 'u_open':
        actives = marque(marques[jeton.tag] ?? '').addToSet(actives);
        break;
      case 'link_open': {
        const mention = mentionDe(jetons, index);
        if (mention !== null) {
          noeuds.push(creer('pageMention', mention.attributs).mark(actives));
          index = mention.fin;
          break;
        }
        actives = marque('link', { href: jeton.attrGet('href') ?? '', title: jeton.attrGet('title') }).addToSet(actives);
        break;
      }
      case 'strong_close':
      case 'em_close':
      case 's_close':
      case 'mark_close':
      case 'u_close':
        actives = retirer(actives, marques[jeton.tag] ?? '');
        break;
      case 'link_close':
        actives = retirer(actives, 'link');
        break;
      default:
        // Image, HTML en ligne... : pas encore dans le schéma.
        throw new UnsupportedMarkdown();
    }
  }
  return noeuds;
}

/**
 * Un lien `notes://uuid` dont le texte est simple devient une mention. Rend
 * ses attributs et l'index de sa fermeture, ou null : lien ordinaire.
 */
function mentionDe(jetons: Jeton[], index: number): { attributs: Record<string, unknown>; fin: number } | null {
  const ouverture = jetons[index] as Jeton;
  const id = idDeLienInterne(ouverture.attrGet('href') ?? '');
  if (id === null) {
    return null;
  }
  let libelle = '';
  for (let fin = index + 1; fin < jetons.length; fin++) {
    const jeton = jetons[fin] as Jeton;
    if (jeton.type === 'link_close') {
      return { attributs: { id, libelle, title: ouverture.attrGet('title') }, fin };
    }
    if (jeton.type !== 'text') {
      return null;
    }
    libelle += jeton.content;
  }
  return null;
}

function retirer(actives: readonly Mark[], nom: string): readonly Mark[] {
  const type = schema.marks[nom];
  return type === undefined ? actives : type.removeFromSet(actives);
}
