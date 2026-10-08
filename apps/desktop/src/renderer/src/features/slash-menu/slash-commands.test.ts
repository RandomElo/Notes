import { lireMarkdown } from '@notes/document';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { describe, expect, it } from 'vitest';
import { commandes, dateEnToutesLettres, filtrerCommandes } from './slash-commands';
import { declencheur } from './slash-trigger';

const libelles = (requete: string): string[] => filtrerCommandes(requete).map((commande) => commande.libelle);

describe('filtrerCommandes', () => {
  it('rend toutes les commandes sans recherche, et seulement celles qui existent déjà', () => {
    expect(libelles('')).toEqual(commandes.map((commande) => commande.libelle));
    expect(libelles('')).toEqual([
      'Texte', 'Titre 1', 'Titre 2', 'Titre 3', 'Titre 4', 'Titre 5', 'Liste à puces', 'Liste numérotée', 'Tâche', 'Mode liste de tâches', 'Code',
      'Tableau', 'Image', 'Callout', 'Page enfant', 'Lien vers une page', 'Date',
    ]);
    expect(libelles('lien')).toEqual(['Lien vers une page']);
    expect(libelles('@')).toEqual(['Lien vers une page']);
    // Citation et séparateur ne sont pas proposés.
    for (const absente of ['citation', 'quote', 'separateur', 'divider', '---']) {
      expect(libelles(absente)).toEqual([]);
    }
  });

  it('ignore les accents et la casse', () => {
    expect(libelles('TÂCHE')).toEqual(['Tâche', 'Mode liste de tâches']);
    expect(libelles('tache')).toEqual(['Tâche', 'Mode liste de tâches']);
    expect(libelles('numerotee')).toEqual(['Liste numérotée']);
  });

  it('trouve par les noms anglais et par la syntaxe Markdown', () => {
    expect(libelles('todo')).toEqual(['Tâche', 'Mode liste de tâches']);
    expect(libelles('h3')).toEqual(['Titre 3']);
    expect(libelles('bullet')).toEqual(['Liste à puces']);
    expect(libelles('today')).toEqual(['Date']);
    expect(libelles('table')).toEqual(['Tableau']);
    expect(libelles('encadré')).toEqual(['Callout']);
    expect(libelles('###')).toEqual(['Titre 3', 'Titre 4', 'Titre 5']);
  });

  it('met d’abord les noms qui commencent par la recherche', () => {
    expect(libelles('ti').slice(0, 5)).toEqual(['Titre 1', 'Titre 2', 'Titre 3', 'Titre 4', 'Titre 5']);
    expect(libelles('li')[0]).toBe('Liste à puces');
    expect(libelles('c')).toEqual(expect.arrayContaining(['Code', 'Tâche']));
    expect(libelles('c')[0]).toBe('Code');
    expect(libelles('zzz')).toEqual([]);
  });
});

describe('dateEnToutesLettres', () => {
  it('écrit la date comme dans une note', () => {
    expect(dateEnToutesLettres(new Date(2026, 9, 2))).toBe('2 octobre 2026');
    expect(dateEnToutesLettres(new Date(2027, 2, 1))).toBe('1er mars 2027');
    expect(dateEnToutesLettres(new Date(2026, 7, 31))).toBe('31 août 2026');
  });
});

describe('declencheur', () => {
  /** L'état d'un document dont le curseur est à la fin du premier bloc de texte qui contient « repere ». */
  const etat = (markdown: string): EditorState => {
    const { document } = lireMarkdown(markdown);
    let fin = 0;
    document.descendants((noeud, position) => {
      if (noeud.isTextblock) {
        fin = position + 1 + noeud.content.size;
      }
    });
    return EditorState.create({ doc: document, selection: TextSelection.create(document, fin) });
  };
  const requete = (markdown: string): string | null => declencheur(etat(markdown))?.requete ?? null;

  it('s’ouvre sur un « / » en début de bloc ou après une espace', () => {
    expect(requete('/')).toBe('');
    expect(requete('/tit')).toBe('tit');
    expect(requete('du texte /co')).toBe('co');
    expect(requete('- puce /liste a')).toBe('liste a');
  });

  it('repère où commence le « / »', () => {
    const courant = etat('du texte /co');
    expect(declencheur(courant)).toEqual({ de: courant.selection.from - 3, a: courant.selection.from, requete: 'co' });
  });

  it('ne s’ouvre pas au milieu d’un mot, d’une date ou d’un chemin', () => {
    for (const texte of ['et/ou', '12/10', 'a /b/c', 'http://exemple', 'du texte / puis autre chose', 'sans barre']) {
      expect(requete(texte), texte).toBeNull();
    }
  });

  it('ne s’ouvre pas dans un bloc de code', () => {
    expect(requete('```\n/code\n```')).toBeNull();
  });

  it('ne s’ouvre pas sur une sélection de texte', () => {
    const { document } = lireMarkdown('/tit');
    expect(declencheur(EditorState.create({ doc: document, selection: TextSelection.create(document, 1, 5) }))).toBeNull();
  });
});

describe('commande du mode liste', () => {
  it('se trouve par « todo list » et « keep », et sert à quitter le mode dans une page en liste', () => {
    expect(libelles('keep')).toEqual(['Mode liste de tâches']);
    expect(filtrerCommandes('mode liste', true).map((commande) => commande.libelle)).toContain('Quitter le mode liste');
    expect(filtrerCommandes('', true).map((commande) => commande.libelle)).not.toContain('Mode liste de tâches');
  });
});
