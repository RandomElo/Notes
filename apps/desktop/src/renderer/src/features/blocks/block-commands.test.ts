import { ecrireMarkdown, lireMarkdown } from '@notes/document';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { AllSelection, EditorState, TextSelection } from '@tiptap/pm/state';
import { describe, expect, it } from 'vitest';
import {
  allerAuBloc, deplacerBlocs, dupliquerBlocs, editerBloc, etendreSelection, indenterBlocs, plageCourante, selectionnerBloc, supprimerBlocs,
} from './block-commands';
import type { BlockCommand } from './block-commands';
import { BlockSelection } from './block-selection';

/** Position du curseur juste après « texte » dans le document. */
function apres(document: ProseMirrorNode, texte: string): number {
  let trouve = -1;
  document.descendants((noeud, position) => {
    const index = noeud.isText ? (noeud.text ?? '').indexOf(texte) : -1;
    if (index !== -1 && trouve === -1) {
      trouve = position + index + texte.length;
    }
  });
  if (trouve === -1) {
    throw new Error(`« ${texte} » introuvable`);
  }
  return trouve;
}

/** Un état dont le curseur est après « curseur » (ou qui sélectionne le texte de « curseur » à « jusque »). */
function etatSur(markdown: string, curseur: string, jusque?: string): EditorState {
  const { document } = lireMarkdown(markdown);
  const selection = TextSelection.create(document, apres(document, curseur), jusque === undefined ? undefined : apres(document, jusque));
  return EditorState.create({ doc: document, selection });
}

/** Applique des commandes à la suite. Échoue si l'une d'elles n'a rien fait. */
function jouer(etat: EditorState, ...commandes: BlockCommand[]): EditorState {
  return commandes.reduce((courant, commande, index) => {
    const transaction = commande(courant);
    if (transaction === null) {
      throw new Error(`la commande ${index + 1} n'a rien fait`);
    }
    return courant.apply(transaction);
  }, etat);
}

const markdown = (etat: EditorState): string => ecrireMarkdown(etat.doc);
/** Texte des blocs sélectionnés, un par bloc. */
const selection = (etat: EditorState): string[] => {
  const textes: string[] = [];
  if (etat.selection instanceof BlockSelection) {
    etat.doc.nodesBetween(etat.selection.from, etat.selection.to, (noeud, position) => {
      if (position >= etat.selection.from && position < etat.selection.to && noeud.isBlock) {
        textes.push(noeud.textContent);
        return false;
      }
      return true;
    });
  }
  return textes;
};
/** Texte qui entoure le curseur : ce qui le précède dans son bloc de texte. */
const avantCurseur = (etat: EditorState): string => etat.selection.$from.parent.textBetween(0, etat.selection.$from.parentOffset);

const page = '# Titre\n\nun\n\n- a\n- b\n  - b1\n  - b2\n- c\n\ndeux\n\n> cité\n>\n> encore\n';

describe('sélection de blocs', () => {
  it('Échap sélectionne le bloc du curseur, puis toute sa liste, puis rend le curseur', () => {
    let etat = jouer(etatSur(page, 'b1'), selectionnerBloc);
    expect(selection(etat)).toEqual(['b1']);
    // D'un sous-item, on passe directement à la liste de premier niveau.
    etat = jouer(etat, selectionnerBloc);
    expect(selection(etat)).toEqual(['abb1b2c']);
    // Rien au-dessus de la liste : le curseur revient, à la fin de ce qui était sélectionné.
    etat = jouer(etat, selectionnerBloc);
    expect(etat.selection).toBeInstanceOf(TextSelection);
    expect(avantCurseur(etat)).toBe('c');

    // Un paragraphe seul : deux fois Échap le désélectionne.
    etat = jouer(etatSur(page, 'un'), selectionnerBloc, selectionnerBloc);
    expect(etat.selection).toBeInstanceOf(TextSelection);
    expect(avantCurseur(etat)).toBe('un');

    etat = jouer(etatSur(page, 'cité'), selectionnerBloc);
    expect(selection(etat)).toEqual(['cité']);
    expect(jouer(etat, selectionnerBloc).selection).toBeInstanceOf(TextSelection);
    expect(selection(jouer(etatSur(page, 'Tit'), selectionnerBloc))).toEqual(['Titre']);
  });

  it('prend tous les blocs que traverse une sélection de texte', () => {
    expect(selection(jouer(etatSur(page, 'un', 'deux'), selectionnerBloc))).toEqual(['un', 'abb1b2c', 'deux']);
    expect(selection(jouer(etatSur(page, 'a', 'c'), selectionnerBloc))).toEqual(['a', 'bb1b2', 'c']);
    // Une liste où la sélection s'arrête est prise en entier.
    expect(selection(jouer(etatSur(page, 'un', 'b1'), selectionnerBloc))).toEqual(['un', 'abb1b2c']);
  });

  it('prend toute la page après Ctrl+A', () => {
    const depart = etatSur(page, 'un');
    const tout = depart.apply(depart.tr.setSelection(new AllSelection(depart.doc)));
    expect(selection(jouer(tout, selectionnerBloc))).toEqual(['Titre', 'un', 'abb1b2c', 'deux', 'citéencore']);
  });

  it('les flèches parcourent les blocs dans l’ordre de lecture', () => {
    let etat = jouer(etatSur(page, 'un'), selectionnerBloc);
    const vus: string[] = [];
    for (let i = 0; i < 9; i++) {
      etat = jouer(etat, allerAuBloc(1));
      vus.push(selection(etat).join('|'));
    }
    expect(vus).toEqual(['a', 'bb1b2', 'b1', 'b2', 'c', 'deux', 'citéencore', 'cité', 'encore']);
    expect(allerAuBloc(1)(etat)).toBeNull();
    expect(selection(jouer(etat, allerAuBloc(-1), allerAuBloc(-1)))).toEqual(['citéencore']);
    expect(allerAuBloc(-1)(jouer(etatSur(page, 'Titre'), selectionnerBloc))).toBeNull();
  });

  it('Maj+flèches étend la sélection aux blocs frères, et la réduit en sens inverse', () => {
    let etat = jouer(etatSur(page, 'a'), selectionnerBloc, etendreSelection(1), etendreSelection(1));
    expect(selection(etat)).toEqual(['a', 'bb1b2', 'c']);
    expect(etendreSelection(1)(etat)).toBeNull();
    etat = jouer(etat, etendreSelection(-1));
    expect(selection(etat)).toEqual(['a', 'bb1b2']);
    expect(selection(jouer(etatSur(page, 'deux'), selectionnerBloc, etendreSelection(-1)))).toEqual(['abb1b2c', 'deux']);
  });

  it('Entrée rend le curseur, à la fin du bloc', () => {
    const etat = jouer(etatSur(page, 'Tit'), selectionnerBloc, editerBloc);
    expect(etat.selection).toBeInstanceOf(TextSelection);
    expect(avantCurseur(etat)).toBe('Titre');
  });

  it('survit à l’annulation et au rétablissement par sa forme JSON', () => {
    const etat = jouer(etatSur(page, 'a'), selectionnerBloc, etendreSelection(1));
    const relue = EditorState.fromJSON({ schema: etat.schema }, etat.toJSON());
    expect(relue.selection.eq(etat.selection)).toBe(true);
  });
});

describe('déplacer', () => {
  it('fait passer un bloc au-dessus ou au-dessous de son voisin, le curseur restant dans le texte', () => {
    const etat = jouer(etatSur('un\n\ndeux\n\ntrois\n', 'de'), deplacerBlocs(-1));
    expect(markdown(etat)).toBe('deux\n\nun\n\ntrois\n');
    expect(avantCurseur(etat)).toBe('de');
    expect(markdown(jouer(etat, deplacerBlocs(1), deplacerBlocs(1)))).toBe('un\n\ntrois\n\ndeux\n');
    expect(deplacerBlocs(-1)(etat)).toBeNull();
  });

  it('déplace plusieurs blocs sélectionnés d’un coup et garde la sélection', () => {
    const etat = jouer(etatSur('un\n\ndeux\n\ntrois\n\nquatre\n', 'deux'), selectionnerBloc, etendreSelection(1), deplacerBlocs(1));
    expect(markdown(etat)).toBe('un\n\nquatre\n\ndeux\n\ntrois\n');
    expect(selection(etat)).toEqual(['deux', 'trois']);
  });

  it('échange deux items, sous-liste comprise', () => {
    expect(markdown(jouer(etatSur(page, 'b'), deplacerBlocs(-1)))).toContain('- b\n  - b1\n  - b2\n- a\n- c\n');
    expect(markdown(jouer(etatSur(page, 'b2'), deplacerBlocs(-1)))).toContain('- b\n  - b2\n  - b1\n');
  });

  it('fait sauter un paragraphe par-dessus une liste entière', () => {
    expect(markdown(jouer(etatSur(page, 'deux'), deplacerBlocs(-1)))).toBe('# Titre\n\nun\n\ndeux\n\n- a\n- b\n  - b1\n  - b2\n- c\n\n> cité\n>\n> encore\n');
  });

  it('sort le premier ou le dernier item de sa liste pour franchir le bloc voisin', () => {
    const etat = jouer(etatSur(page, 'a'), deplacerBlocs(-1));
    expect(markdown(etat)).toBe('# Titre\n\n- a\n\nun\n\n- b\n  - b1\n  - b2\n- c\n\ndeux\n\n> cité\n>\n> encore\n');
    expect(avantCurseur(etat)).toBe('a');
    // Et il y revient, à sa place.
    expect(markdown(jouer(etat, deplacerBlocs(1)))).toBe(page);
    expect(markdown(jouer(etatSur(page, 'c'), deplacerBlocs(1)))).toContain('- b\n  - b1\n  - b2\n\ndeux\n\n- c\n\n> cité');
  });

  it('rejoint la liste voisine de même nature plutôt que d’en créer une à côté', () => {
    const etat = jouer(etatSur('- a\n\ntexte\n\n- b\n- c\n', 'b'), deplacerBlocs(-1));
    expect(markdown(etat)).toBe('- a\n- b\n\ntexte\n\n- c\n');
    expect(avantCurseur(etat)).toBe('b');
  });

  it('fait changer de parent un sous-item au bord de sa sous-liste, sans changer son niveau', () => {
    // Vers le haut : il devient le dernier sous-item de l'item du dessus.
    let etat = jouer(etatSur(page, 'b1'), deplacerBlocs(-1));
    expect(markdown(etat)).toContain('- a\n  - b1\n- b\n  - b2\n- c\n');
    expect(avantCurseur(etat)).toBe('b1');
    // Et il revient à sa place en redescendant.
    expect(markdown(jouer(etat, deplacerBlocs(1)))).toBe(page);
    // Vers le bas : il devient le premier sous-item de l'item du dessous.
    etat = jouer(etatSur(page, 'b2'), deplacerBlocs(1));
    expect(markdown(etat)).toContain('- a\n- b\n  - b1\n- c\n  - b2\n');
    expect(avantCurseur(etat)).toBe('b2');
    expect(markdown(jouer(etat, deplacerBlocs(-1)))).toBe(page);
    // Il rejoint les sous-items qui sont déjà là.
    const deux = '- a\n  - a1\n- b\n  - b1\n';
    expect(markdown(jouer(etatSur(deux, 'b1'), deplacerBlocs(-1)))).toBe('- a\n  - a1\n  - b1\n- b\n');
    expect(markdown(jouer(etatSur(deux, 'a1'), deplacerBlocs(1)))).toBe('- a\n- b\n  - a1\n  - b1\n');
  });

  it('sort un sous-item au niveau de son parent quand celui-ci n’a pas de voisin', () => {
    const liste = '- a\n  - a1\n  - a2\n';
    let etat = jouer(etatSur(liste, 'a1'), deplacerBlocs(-1));
    expect(markdown(etat)).toBe('- a1\n- a\n  - a2\n');
    expect(avantCurseur(etat)).toBe('a1');
    etat = jouer(etatSur(liste, 'a2'), deplacerBlocs(1));
    expect(markdown(etat)).toBe('- a\n  - a1\n- a2\n');
    expect(avantCurseur(etat)).toBe('a2');
    // Plusieurs sous-items sélectionnés partent ensemble et restent sélectionnés.
    etat = jouer(etatSur(liste, 'a1'), selectionnerBloc, etendreSelection(1), deplacerBlocs(1));
    expect(markdown(etat)).toBe('- a\n- a1\n- a2\n');
    expect(selection(etat)).toEqual(['a1', 'a2']);
  });

  it('ne fait rien quand il n’y a nulle part où aller', () => {
    expect(deplacerBlocs(1)(etatSur(page, 'encore'))).toBeNull();
    expect(deplacerBlocs(-1)(etatSur('- seul\n', 'seul'))).toBeNull();
  });

  it('déplace un bloc dans une citation sans en sortir', () => {
    expect(markdown(jouer(etatSur(page, 'encore'), deplacerBlocs(-1)))).toContain('> encore\n>\n> cité\n');
  });
});

describe('dupliquer et supprimer', () => {
  it('duplique le bloc du curseur juste en dessous, et y place le curseur', () => {
    const etat = jouer(etatSur('un\n\ndeux\n', 'de'), dupliquerBlocs);
    expect(markdown(etat)).toBe('un\n\ndeux\n\ndeux\n');
    expect(etat.selection.$from.index(0)).toBe(2);
    expect(avantCurseur(etat)).toBe('de');
  });

  it('duplique un item avec sa sous-liste, ou plusieurs blocs sélectionnés', () => {
    expect(markdown(jouer(etatSur(page, 'b'), dupliquerBlocs))).toContain('- b\n  - b1\n  - b2\n- b\n  - b1\n  - b2\n- c\n');
    const etat = jouer(etatSur('un\n\ndeux\n\ntrois\n', 'un'), selectionnerBloc, etendreSelection(1), dupliquerBlocs);
    expect(markdown(etat)).toBe('un\n\ndeux\n\nun\n\ndeux\n\ntrois\n');
    expect(etat.selection.$from.index(0)).toBe(2);
    expect(selection(etat)).toEqual(['un', 'deux']);
  });

  it('supprime les blocs sélectionnés et sélectionne celui qui prend leur place', () => {
    let etat = jouer(etatSur('un\n\ndeux\n\ntrois\n', 'deux'), selectionnerBloc, supprimerBlocs);
    expect(markdown(etat)).toBe('un\n\ntrois\n');
    expect(selection(etat)).toEqual(['trois']);
    etat = jouer(etat, supprimerBlocs);
    expect(selection(etat)).toEqual(['un']);
    etat = jouer(etat, supprimerBlocs);
    expect(markdown(etat)).toBe('');
    expect(etat.doc.childCount).toBe(1);
    expect(etat.selection).toBeInstanceOf(TextSelection);
  });

  it('retire la liste avec son dernier item', () => {
    expect(markdown(jouer(etatSur('un\n\n- seul\n\ndeux\n', 'seul'), selectionnerBloc, supprimerBlocs))).toBe('un\n\ndeux\n');
  });

  it('ne supprime rien sans sélection de blocs', () => {
    expect(supprimerBlocs(etatSur(page, 'un'))).toBeNull();
  });
});

describe('indenter', () => {
  it('imbrique les items sélectionnés sous l’item du dessus, et les remonte', () => {
    let etat = jouer(etatSur('- a\n- b\n- c\n', 'b'), selectionnerBloc, etendreSelection(1), indenterBlocs(1));
    expect(markdown(etat)).toBe('- a\n  - b\n  - c\n');
    expect(selection(etat)).toEqual(['b', 'c']);
    etat = jouer(etat, indenterBlocs(-1));
    expect(markdown(etat)).toBe('- a\n- b\n- c\n');
    expect(selection(etat)).toEqual(['b', 'c']);
  });

  it('ne fait rien sur le premier item, ni sur un bloc qui n’est pas un item', () => {
    expect(indenterBlocs(1)(jouer(etatSur('- a\n- b\n', 'a'), selectionnerBloc))).toBeNull();
    expect(indenterBlocs(1)(jouer(etatSur('un\n\ndeux\n', 'deux'), selectionnerBloc))).toBeNull();
  });

  it('indente aussi des tâches', () => {
    expect(markdown(jouer(etatSur('- [ ] a\n- [x] b\n', 'b'), selectionnerBloc, indenterBlocs(1)))).toBe('- [ ] a\n  - [x] b\n');
  });
});

describe('plageCourante', () => {
  it('rend le bloc du curseur', () => {
    const etat = etatSur(page, 'b1');
    const plage = plageCourante(etat);
    expect(plage === null ? null : etat.doc.textBetween(plage.debut, plage.fin)).toBe('b1');
  });
});
