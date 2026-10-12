import { getSchema } from '@tiptap/core';
import { EditorState } from '@tiptap/pm/state';
import { describe, expect, it } from 'vitest';
import { lireMarkdown } from '../markdown/parse';
import { ecrireMarkdown } from '../markdown/serialize';
import { extensionsDuSchema } from '../schema/extensions';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { modifierCorps } from './apply';
import { SousTachesCochees, basculerTache } from './toggle-task';

const corps = '- [ ] React\n  - [ ] HTML\n    - [ ] head\n  - [x] CSS\n- [ ] Node\n';

function tache(document: ProseMirrorNode, texte: string): number {
  let trouvee = -1;
  document.descendants((noeud, position) => {
    if (noeud.type.name === 'taskItem' && noeud.firstChild?.textContent === texte) {
      trouvee = position;
    }
  });
  return trouvee;
}

describe('cocher une tâche coche ses sous-tâches', () => {
  it('à tous les niveaux', () => {
    expect(modifierCorps(corps, (tr) => basculerTache(tr, tache(tr.doc, 'React'), true, false), false)).toBe('- [x] React\n  - [x] HTML\n    - [x] head\n  - [x] CSS\n- [ ] Node\n');
  });

  it('en mode liste, la tâche part dans « Terminé » avec ses sous-tâches cochées', () => {
    expect(modifierCorps(corps, (tr) => basculerTache(tr, tache(tr.doc, 'React'), true, true), true)).toBe('- [ ] Node\n- [x] React\n  - [x] HTML\n    - [x] head\n  - [x] CSS\n');
  });

  it('décocher ne décoche qu’elle', () => {
    const coche = '- [x] React\n  - [x] HTML\n';
    expect(modifierCorps(coche, (tr) => basculerTache(tr, tache(tr.doc, 'React'), false, false), false)).toBe('- [ ] React\n  - [x] HTML\n');
  });
});

describe('la même règle dans l’éditeur', () => {
  const schemaAvecPlugins = getSchema(extensionsDuSchema);
  const plugins = SousTachesCochees.config.addProseMirrorPlugins!.call({} as never) as EditorState['plugins'];

  function etat(markdown: string): EditorState {
    const { document } = lireMarkdown(markdown);
    return EditorState.create({ doc: schemaAvecPlugins.nodeFromJSON(document.toJSON()), plugins });
  }

  it('la case cochée par l’éditeur coche les sous-tâches', () => {
    const avant = etat(corps);
    const position = tache(avant.doc, 'React');
    // applyTransaction passe par les plugins : c'est le chemin d'une case cochée dans l'éditeur.
    const { state } = avant.applyTransaction(avant.tr.setNodeMarkup(position, undefined, { ...avant.doc.nodeAt(position)!.attrs, checked: true }));
    expect(ecrireMarkdown(state.doc)).toBe('- [x] React\n  - [x] HTML\n    - [x] head\n  - [x] CSS\n- [ ] Node\n');
  });

  it('une autre modification ne touche pas une tâche déjà cochée dans le fichier', () => {
    const avant = etat('- [x] React\n  - [ ] HTML\n\nTexte\n');
    const { state } = avant.applyTransaction(avant.tr.insertText('!', avant.doc.content.size - 1));
    expect(ecrireMarkdown(state.doc)).toBe('- [x] React\n  - [ ] HTML\n\nTexte!\n');
  });
});
