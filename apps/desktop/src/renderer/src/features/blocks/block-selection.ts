import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Selection } from '@tiptap/pm/state';
import type { Mappable } from '@tiptap/pm/transform';
import { estUnite, plageDEnfants } from './block-ranges';
import type { BlockRange } from './block-ranges';

/**
 * Sélection d'un ou plusieurs blocs frères entiers (docs/spec/editeur.md). « ancre » et
 * « tete » sont les positions de début du bloc d'où part la sélection et de
 * celui jusqu'où elle s'étend : Maj+flèche déplace la tête, l'ancre reste.
 */
export class BlockSelection extends Selection {
  readonly ancre: number;
  readonly tete: number;

  constructor(document: ProseMirrorNode, ancre: number, tete: number = ancre) {
    const debut = Math.min(ancre, tete);
    const dernier = Math.max(ancre, tete);
    const fin = dernier + (document.nodeAt(dernier)?.nodeSize ?? 0);
    super(document.resolve(debut), document.resolve(fin));
    this.ancre = ancre;
    this.tete = tete;
    // Le curseur et la sélection du navigateur sont masqués : ce sont les blocs qui sont mis en évidence.
    this.visible = false;
  }

  /** Vrai si deux positions désignent des blocs frères. */
  static valide(document: ProseMirrorNode, ancre: number, tete: number): boolean {
    if (ancre < 0 || tete < 0 || ancre > document.content.size || tete > document.content.size) {
      return false;
    }
    const a = document.resolve(ancre);
    const t = document.resolve(tete);
    const noeudA = a.nodeAfter;
    const noeudT = t.nodeAfter;
    return (
      noeudA !== null && noeudT !== null && a.depth === t.depth && a.start() === t.start() &&
      estUnite(noeudA, a.parent, a.index()) && estUnite(noeudT, t.parent, t.index())
    );
  }

  static depuisPlage(document: ProseMirrorNode, plage: BlockRange): BlockSelection {
    const dernier = document.resolve(plage.fin).nodeBefore;
    return new BlockSelection(document, plage.debut, plage.fin - (dernier?.nodeSize ?? 0));
  }

  plage(): BlockRange {
    const debut = this.$from;
    const fin = this.$to;
    return plageDEnfants(debut, debut.depth, debut.index(), fin.index() - 1);
  }

  map(document: ProseMirrorNode, correspondance: Mappable): Selection {
    const ancre = correspondance.mapResult(this.ancre, 1);
    const tete = correspondance.mapResult(this.tete, 1);
    if (!ancre.deleted && !tete.deleted && BlockSelection.valide(document, ancre.pos, tete.pos)) {
      return new BlockSelection(document, ancre.pos, tete.pos);
    }
    return Selection.near(document.resolve(Math.min(correspondance.map(this.from), document.content.size)));
  }

  eq(autre: Selection): boolean {
    return autre instanceof BlockSelection && autre.ancre === this.ancre && autre.tete === this.tete;
  }

  toJSON(): { type: string; ancre: number; tete: number } {
    return { type: 'blocs', ancre: this.ancre, tete: this.tete };
  }

  static override fromJSON(document: ProseMirrorNode, json: { ancre?: unknown; tete?: unknown }): Selection {
    if (typeof json.ancre === 'number' && typeof json.tete === 'number' && BlockSelection.valide(document, json.ancre, json.tete)) {
      return new BlockSelection(document, json.ancre, json.tete);
    }
    return Selection.atStart(document);
  }

  override getBookmark(): { map: (correspondance: Mappable) => ReturnType<BlockSelection['getBookmark']>; resolve: (document: ProseMirrorNode) => Selection } {
    const { ancre, tete } = this;
    const signet = (a: number, t: number): ReturnType<BlockSelection['getBookmark']> => ({
      map: (correspondance) => signet(correspondance.map(a, 1), correspondance.map(t, 1)),
      resolve: (document) => (BlockSelection.valide(document, a, t) ? new BlockSelection(document, a, t) : Selection.near(document.resolve(Math.min(a, document.content.size)))),
    });
    return signet(ancre, tete);
  }
}

Selection.jsonID('blocs', BlockSelection);
