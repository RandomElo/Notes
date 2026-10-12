import { ecrireMarkdown, sectionTerminee, texteDeLItem } from '@notes/document';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

/** Une tâche telle que la montre la liste façon Keep (docs/spec/liste-de-taches.md, docs/spec/android.md). */
export interface LigneDeTache {
  /** Position de la tâche dans le document, pour les opérations. */
  position: number;
  coche: boolean;
  /** Markdown de ligne du texte, ce qu'on modifie. */
  texte: string;
  /** Texte affiché, sans Markdown. */
  texteBrut: string;
  /** 0 pour une tâche de la liste, 1 et plus pour une sous-tâche. */
  profondeur: number;
  /** Rang dans sa liste, pour réordonner. */
  rang: number;
  /** Dans la section « Terminé ». */
  termine: boolean;
  /** Dans « Terminé », elle ou une tâche qui la contient : ne se glisse pas, se replie avec la section. */
  enTermine: boolean;
  /** Début de la liste qui la contient : les tâches de même liste sont sœurs, et se réordonnent entre elles. */
  liste: number;
  /** Markdown des blocs posés sous la tâche (code, image, tableau…), montrés en lecture seule. Vide s'il n'y en a pas. */
  blocsSous: string;
}

export interface ContenuDeListe {
  lignes: LigneDeTache[];
  /** Markdown des blocs hors liste (page pas encore remise en liste), montrés en lecture seule après les tâches. */
  horsListe: string;
}

function markdownDe(document: ProseMirrorNode, noeuds: ProseMirrorNode[]): string {
  return noeuds.length === 0 ? '' : ecrireMarkdown(document.type.schema.nodes['doc']!.create(null, noeuds));
}

/** Les tâches d'une page en mode liste, dans l'ordre de lecture, sous-tâches comprises. */
export function lignesDeTaches(document: ProseMirrorNode): ContenuDeListe {
  const termine = new Set(sectionTerminee(document));
  const lignes: LigneDeTache[] = [];
  const horsListe: ProseMirrorNode[] = [];

  const parcourir = (liste: ProseMirrorNode, debut: number, profondeur: number, sousTermine: boolean): void => {
    let position = debut + 1;
    liste.forEach((item, _decalage, rang) => {
      const blocsSous: ProseMirrorNode[] = [];
      const sousListes: { noeud: ProseMirrorNode; position: number }[] = [];
      let interieur = position + 1;
      item.forEach((enfant, _d, index) => {
        if (enfant.type.name === 'taskList') {
          sousListes.push({ noeud: enfant, position: interieur });
        } else if (index > 0) {
          blocsSous.push(enfant);
        }
        interieur += enfant.nodeSize;
      });
      const estTermine = termine.has(position);
      lignes.push({
        position,
        coche: item.attrs['checked'] === true,
        texte: texteDeLItem(document, position),
        texteBrut: item.firstChild?.type.name === 'paragraph' ? item.firstChild.textContent : '',
        profondeur,
        rang,
        termine: estTermine,
        enTermine: sousTermine || estTermine,
        liste: debut,
        blocsSous: markdownDe(document, blocsSous),
      });
      for (const sous of sousListes) {
        parcourir(sous.noeud, sous.position, profondeur + 1, sousTermine || estTermine);
      }
      position += item.nodeSize;
    });
  };

  document.forEach((bloc, debut) => {
    if (bloc.type.name === 'taskList') {
      parcourir(bloc, debut, 0, false);
    } else if (!(bloc.type.name === 'paragraph' && bloc.content.size === 0)) {
      horsListe.push(bloc);
    }
  });
  return { lignes, horsListe: markdownDe(document, horsListe) };
}
