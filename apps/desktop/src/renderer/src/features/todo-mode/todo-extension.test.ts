import { ecrireMarkdown, lireMarkdown, schema } from '@notes/document';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { describe, expect, it } from 'vitest';
import { placerSousLaTache, rangerLaPage, tacheALaFrappe } from './todo-extension';

/** La page lue de « corps », suivie d'un paragraphe vide où se trouve le curseur (clic sous le dernier bloc). */
function avecParagrapheVide(corps: string, placer: 'fin' | 'debut' = 'fin'): { etat: EditorState; source: ReturnType<typeof lireMarkdown>['source'] } {
  const { document, source } = lireMarkdown(corps);
  const vide = schema.nodes['paragraph']!.create();
  const doc = placer === 'fin' ? document.copy(document.content.addToEnd(vide)) : document.copy(document.content.addToStart(vide));
  const position = placer === 'fin' ? doc.content.size - 1 : 1;
  return { etat: EditorState.create({ doc, selection: TextSelection.create(doc, position) }), source };
}

describe('frappe en mode liste', () => {
  it('une ligne tapée sous une liste en devient la tâche suivante', () => {
    const { etat, source } = avecParagrapheVide('- [ ] pain\n');
    const tr = tacheALaFrappe(etat, 'l');
    expect(tr).not.toBeNull();
    expect(ecrireMarkdown(tr!.doc, source)).toBe('- [ ] pain\n- [ ] l\n');
    // Le curseur est après la lettre tapée.
    expect(tr!.selection.$from.parent.textContent).toBe('l');
    expect(tr!.selection.$from.parentOffset).toBe(1);
  });

  it('au-dessus d’une liste, la rejoint en tête', () => {
    const { etat, source } = avecParagrapheVide('- [ ] pain\n', 'debut');
    const tr = tacheALaFrappe(etat, 'x');
    expect(ecrireMarkdown(tr!.doc, source)).toBe('- [ ] x\n- [ ] pain\n');
    expect(tr!.selection.$from.parent.textContent).toBe('x');
  });

  it('sous un titre, crée une liste', () => {
    const { etat, source } = avecParagrapheVide('# Courses\n');
    expect(ecrireMarkdown(tacheALaFrappe(etat, 'p')!.doc, source)).toBe('# Courses\n\n- [ ] p\n');
  });

  it('fait une tâche de tout texte, même un titre ou le menu, mais laisse un paragraphe déjà écrit', () => {
    const { etat } = avecParagrapheVide('- [ ] pain\n');
    for (const texte of ['#', '/', '`']) {
      expect(tacheALaFrappe(etat, texte)).not.toBeNull();
    }
    const ecrit = EditorState.create({ doc: lireMarkdown('Texte\n').document });
    expect(tacheALaFrappe(ecrit.apply(ecrit.tr.setSelection(TextSelection.create(ecrit.doc, 3))), 'a')).toBeNull();
  });
});

describe('rangement de la page en liste', () => {
  it('un titre tapé redevient une tâche, le curseur reste dans son texte', () => {
    const { document, source } = lireMarkdown('- [ ] a\n');
    const titre = schema.nodes['heading']!.create({ level: 1 }, schema.text('Bureau'));
    const doc = document.copy(document.content.addToEnd(titre));
    // Curseur après « Bur ».
    const etat = EditorState.create({ doc, selection: TextSelection.create(doc, document.content.size + 4) });
    const tr = rangerLaPage(etat, true);
    expect(ecrireMarkdown(tr!.doc, source)).toBe('- [ ] a\n- [ ] Bureau\n');
    expect(tr!.selection.$head.parent.textContent).toBe('Bureau');
    expect(tr!.selection.$head.parentOffset).toBe(3);
  });

  it('quitter une tâche vide la retire, y rester la garde', () => {
    const { document, source } = lireMarkdown('- [ ] a\n- [ ] \n');
    const dansA = EditorState.create({ doc: document, selection: TextSelection.create(document, 3) });
    expect(ecrireMarkdown(rangerLaPage(dansA, false)!.doc, source)).toBe('- [ ] a\n');
    const dansLaVide = EditorState.create({ doc: document, selection: TextSelection.create(document, document.content.size - 3) });
    expect(rangerLaPage(dansLaVide, false)).toBeNull();
  });
});

describe('bloc choisi dans le menu, en mode liste', () => {
  const dans = (corps: string, texte: string) => {
    const { document, source } = lireMarkdown(corps);
    let position = -1;
    document.descendants((noeud, debut) => {
      if (noeud.type.name === 'paragraph' && noeud.textContent === texte && position === -1) {
        position = debut + 1 + texte.length;
      }
    });
    return { etat: EditorState.create({ doc: document, selection: TextSelection.create(document, position) }), source };
  };

  it('sous le texte de la tâche', () => {
    const { etat, source } = dans('- [ ] a\n- [ ] b\n', 'a');
    const tr = placerSousLaTache(etat)!;
    expect(tr.selection.$from.node(-1).firstChild?.textContent).toBe('a');
    const code = tr.replaceSelectionWith(schema.nodes['codeBlock']!.create(null, schema.text('x')));
    expect(ecrireMarkdown(code.doc, source)).toBe('- [ ] a\n  ```\n  x\n  ```\n- [ ] b\n');
  });

  it('sur une tâche vide après une autre, sous la tâche d’avant', () => {
    const { etat, source } = dans('- [ ] a\n- [ ] \n', '');
    const tr = placerSousLaTache(etat)!;
    expect(tr.doc.child(0).childCount).toBe(1);
    expect(ecrireMarkdown(tr.replaceSelectionWith(schema.nodes['codeBlock']!.create(null, schema.text('x'))).doc, source)).toBe('- [ ] a\n  ```\n  x\n  ```\n');
  });

  it('rien hors du texte d’une tâche', () => {
    expect(placerSousLaTache(dans('Texte\n', 'Texte').etat)).toBeNull();
  });
});
