import type { Transform } from '@tiptap/pm/transform';
import { describe, expect, it } from 'vitest';
import { documentDuCorps, modifierCorps } from './apply';
import { ajouterItemApres, decalerADroite, decalerAGauche, deplacerItem, modifierTexteDItem, supprimerItem, texteDeLItem } from './list-items';

/** Position de l'item (puce ou tâche) dont le premier paragraphe est « texte ». */
function item(tr: Transform | { doc: ReturnType<typeof documentDuCorps> }, texte: string): number {
  let trouvee = -1;
  tr.doc.descendants((noeud, position) => {
    if ((noeud.type.name === 'taskItem' || noeud.type.name === 'listItem') && noeud.firstChild?.textContent === texte) {
      trouvee = position;
    }
  });
  return trouvee;
}

describe('opérations du téléphone sur les items', () => {
  it('modifie le texte d’une tâche sans toucher au reste', () => {
    const corps = '# Courses\n\n- [ ] lait\n- [x] pain\n\nUn  paragraphe   tel quel.\n';
    expect(modifierCorps(corps, (tr) => modifierTexteDItem(tr, item(tr, 'lait'), 'lait **entier**'), false)).toBe(
      '# Courses\n\n- [ ] lait **entier**\n- [x] pain\n\nUn  paragraphe   tel quel.\n',
    );
  });

  it('prend en texte simple une ligne qui ferait un autre bloc', () => {
    const resultat = modifierCorps('- [ ] lait\n', (tr) => modifierTexteDItem(tr, item(tr, 'lait'), '# pas un titre'), false);
    expect(resultat).toBe('- [ ] \\# pas un titre\n');
  });

  it('rend le texte d’un item en Markdown de ligne', () => {
    const document = documentDuCorps('- [ ] lait *bio*\n\nTexte.\n\n- pain\n');
    expect(texteDeLItem(document, item({ doc: document }, 'lait bio'))).toBe('lait *bio*');
    expect(texteDeLItem(document, item({ doc: document }, 'pain'))).toBe('pain');
  });

  it('ne change rien si le texte est le même', () => {
    expect(modifierCorps('- [ ] lait\n', (tr) => modifierTexteDItem(tr, item(tr, 'lait'), ' lait '), false)).toBeNull();
  });

  it('supprime un item avec ses sous-items, et la liste vidée', () => {
    expect(modifierCorps('- a\n  - a1\n- b\n', (tr) => supprimerItem(tr, item(tr, 'a')), false)).toBe('- b\n');
    expect(modifierCorps('Texte\n\n- seul\n', (tr) => supprimerItem(tr, item(tr, 'seul')), false)).toBe('Texte\n');
  });

  it('déplace un item dans sa liste', () => {
    const corps = '- [ ] a\n- [ ] b\n- [ ] c\n';
    expect(modifierCorps(corps, (tr) => deplacerItem(tr, item(tr, 'c'), 0), false)).toBe('- [ ] c\n- [ ] a\n- [ ] b\n');
    expect(modifierCorps(corps, (tr) => deplacerItem(tr, item(tr, 'a'), 2), false)).toBe('- [ ] b\n- [ ] c\n- [ ] a\n');
    expect(modifierCorps(corps, (tr) => deplacerItem(tr, item(tr, 'b'), 1), false)).toBeNull();
  });

  it('ajoute un item du même genre après un autre', () => {
    expect(modifierCorps('- a\n- c\n', (tr) => ajouterItemApres(tr, item(tr, 'a'), 'b'), false)).toBe('- a\n- b\n- c\n');
    expect(modifierCorps('- [x] a\n', (tr) => ajouterItemApres(tr, item(tr, 'a'), 'b'), false)).toBe('- [x] a\n- [ ] b\n');
    expect(modifierCorps('- a\n', (tr) => ajouterItemApres(tr, item(tr, 'a'), '  '), false)).toBeNull();
  });

  it('en mode liste, une tâche cochée déplacée reste rangée dans « Terminé »', () => {
    const corps = '- [ ] a\n- [ ] b\n- [x] fait\n';
    expect(modifierCorps(corps, (tr) => deplacerItem(tr, item(tr, 'fait'), 0), true)).toBeNull();
    expect(modifierCorps(corps, (tr) => ajouterItemApres(tr, item(tr, 'b'), 'c'), true)).toBe('- [ ] a\n- [ ] b\n- [ ] c\n- [x] fait\n');
  });
});

describe('tâches sur plusieurs niveaux', () => {
  const corps = '- [ ] React\n- [ ] HTML\n- [ ] head\n- [ ] CSS\n';

  it('décale à droite sous la tâche du dessus, sur autant de niveaux qu’on veut', () => {
    const un = modifierCorps(corps, (tr) => decalerADroite(tr, item(tr, 'HTML')), true)!;
    expect(un).toBe('- [ ] React\n  - [ ] HTML\n- [ ] head\n- [ ] CSS\n');
    const deux = modifierCorps(un, (tr) => decalerADroite(tr, item(tr, 'head')), true)!;
    const trois = modifierCorps(deux, (tr) => decalerADroite(tr, item(tr, 'head')), true)!;
    expect(trois).toBe('- [ ] React\n  - [ ] HTML\n    - [ ] head\n- [ ] CSS\n');
  });

  it('ne décale pas à droite la première tâche d’une liste', () => {
    expect(modifierCorps(corps, (tr) => decalerADroite(tr, item(tr, 'React')), true)).toBeNull();
  });

  it('décale à gauche, et pas au-delà du premier niveau', () => {
    const imbrique = '- [ ] React\n  - [ ] HTML\n    - [ ] head\n- [ ] CSS\n';
    expect(modifierCorps(imbrique, (tr) => decalerAGauche(tr, item(tr, 'head')), true)).toBe('- [ ] React\n  - [ ] HTML\n  - [ ] head\n- [ ] CSS\n');
    expect(modifierCorps(imbrique, (tr) => decalerAGauche(tr, item(tr, 'React')), true)).toBeNull();
  });

  it('emmène les sous-tâches avec la tâche décalée', () => {
    const imbrique = '- [ ] React\n- [ ] HTML\n  - [ ] head\n';
    expect(modifierCorps(imbrique, (tr) => decalerADroite(tr, item(tr, 'HTML')), true)).toBe('- [ ] React\n  - [ ] HTML\n    - [ ] head\n');
  });
});

describe('tâche ajoutée à un autre niveau', () => {
  it('s’ajoute sous la tâche d’avant, ou un niveau plus haut', () => {
    expect(modifierCorps('- [ ] React\n', (tr) => ajouterItemApres(tr, item(tr, 'React'), 'HTML', 1), true)).toBe('- [ ] React\n  - [ ] HTML\n');
    const imbrique = '- [ ] React\n  - [ ] HTML\n    - [ ] head\n';
    expect(modifierCorps(imbrique, (tr) => ajouterItemApres(tr, item(tr, 'head'), 'CSS', -1), true)).toBe('- [ ] React\n  - [ ] HTML\n    - [ ] head\n  - [ ] CSS\n');
    expect(modifierCorps(imbrique, (tr) => ajouterItemApres(tr, item(tr, 'head'), 'Node', -2), true)).toBe('- [ ] React\n  - [ ] HTML\n    - [ ] head\n- [ ] Node\n');
  });
});
