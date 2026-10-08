import { Transform } from '@tiptap/pm/transform';
import { describe, expect, it } from 'vitest';
import { lireMarkdown } from '../markdown/parse';
import { ecrireMarkdown } from '../markdown/serialize';
import { ajouterTache } from './list-items';
import { basculerTache } from './toggle-task';
import { schema } from '../schema/extensions';
import { convertirEnListe, normaliserListe, ouvrirNouvelleTache, rangerTaches, retirerTachesVides, sectionTerminee } from './todo-mode';

/** Applique une opération au corps Markdown et rend le corps qui en sort, comme à l'enregistrement. */
function appliquer(corps: string, operation: (tr: Transform) => unknown): string {
  const { document, source } = lireMarkdown(corps);
  const tr = new Transform(document);
  operation(tr);
  return ecrireMarkdown(tr.doc, source);
}

/** Position de la tâche dont le texte est « texte ». */
function tache(tr: Transform, texte: string): number {
  let trouvee = -1;
  tr.doc.descendants((noeud, position) => {
    if (noeud.type.name === 'taskItem' && noeud.firstChild?.textContent === texte) {
      trouvee = position;
    }
  });
  return trouvee;
}

describe('passage en mode liste', () => {
  it('fait une seule liste : titres et paragraphes en tâches, code et image sous la tâche qui précède', () => {
    const corps = 'Pain\n\n- lait\n- œufs\n\n# Bureau\n\n1. imprimer\n   - recto\n\n```js\nx\n```\n\nRappeler\n';
    expect(appliquer(corps, convertirEnListe)).toBe(
      '- [ ] Pain\n- [ ] lait\n- [ ] œufs\n- [ ] Bureau\n- [ ] imprimer\n  - [ ] recto\n  ```js\n  x\n  ```\n- [ ] Rappeler\n',
    );
  });

  it('ne change rien à une page déjà en tâches bien rangées', () => {
    const corps = '- [ ] a\n- [x] b\n';
    const { document, source } = lireMarkdown(corps);
    const tr = new Transform(document);
    expect(convertirEnListe(tr)).toBe(false);
    expect(ecrireMarkdown(tr.doc, source)).toBe(corps);
  });

  it('garde les cases déjà cochées et les range en bas', () => {
    expect(appliquer('- [x] fait\n- [ ] à faire\n\nIdée\n', convertirEnListe)).toBe('- [ ] à faire\n- [ ] Idée\n- [x] fait\n');
  });

  it('un bloc en tête de page passe sous une tâche vide', () => {
    expect(appliquer('```sh\nls\n```\n\nSuite\n', convertirEnListe)).toBe('- [ ] \n  ```sh\n  ls\n  ```\n- [ ] Suite\n');
  });

  it('ne fait rien sur une page vide', () => {
    const tr = new Transform(lireMarkdown('').document);
    expect(convertirEnListe(tr)).toBe(false);
  });
});

describe('page en liste après une modification', () => {
  it('rejoint la liste : paragraphe vide en tâche vide, titre en tâche, titre dans une tâche en texte', () => {
    const { document, source } = lireMarkdown('- [ ] a\n- [ ] b\n');
    const p = schema.nodes['paragraph']!;
    const tr = new Transform(document);
    tr.insert(tr.doc.content.size, [p.create(), schema.nodes['heading']!.create({ level: 2 }, schema.text('Titre'))]);
    expect(normaliserListe(tr)).toBe(true);
    expect(ecrireMarkdown(tr.doc, source)).toBe('- [ ] a\n- [ ] b\n- [ ] \n- [ ] Titre\n');
    const dedans = new Transform(lireMarkdown('- [ ] a\n').document);
    // Après le texte de la tâche « a » : ouverture de la liste, de l'item, puis le paragraphe « a » (3).
    dedans.insert(5, schema.nodes['heading']!.create({ level: 1 }, schema.text('Sous-titre')));
    expect(normaliserListe(dedans)).toBe(true);
    expect(dedans.doc.child(0).child(0).child(1).type.name).toBe('paragraph');
  });

  it('garde une liste à puces ou du code sous une tâche', () => {
    const corps = '- [ ] a\n  - détail\n\n  ```js\n  x\n  ```\n';
    const tr = new Transform(lireMarkdown(corps).document);
    expect(normaliserListe(tr)).toBe(false);
  });

  it('laisse le paragraphe vide d’une page vide', () => {
    expect(normaliserListe(new Transform(lireMarkdown('').document))).toBe(false);
  });
});

describe('tâches laissées vides', () => {
  it('disparaissent, sauf celle du curseur', () => {
    const corps = '- [ ] a\n- [ ] \n- [ ] b\n- [ ] \n';
    const tr = new Transform(lireMarkdown(corps).document);
    const vides: number[] = [];
    tr.doc.descendants((n, pos) => {
      if (n.type.name === 'taskItem' && n.textContent === '') vides.push(pos);
    });
    expect(retirerTachesVides(tr, vides[1]! + 2)).toBe(true);
    expect(ecrireMarkdown(tr.doc, lireMarkdown(corps).source)).toBe('- [ ] a\n- [ ] b\n- [ ] \n');
  });

  it('une liste vidée laisse une page vide', () => {
    const tr = new Transform(lireMarkdown('- [ ] \n').document);
    expect(retirerTachesVides(tr, null)).toBe(true);
    expect(ecrireMarkdown(tr.doc, lireMarkdown('').source)).toBe('');
  });

  it('une tâche cochée ou avec du contenu dessous reste', () => {
    const tr = new Transform(lireMarkdown('- [x] \n- [ ] \n  ```\n  x\n  ```\n').document);
    expect(retirerTachesVides(tr, null)).toBe(false);
  });
});

describe('nouvelle tâche', () => {
  it('s’ouvre avant « Terminé », le curseur dedans', () => {
    const tr = new Transform(lireMarkdown('- [ ] a\n- [x] b\n').document);
    const curseur = ouvrirNouvelleTache(tr);
    expect(ecrireMarkdown(tr.doc, lireMarkdown('- [ ] a\n- [x] b\n').source)).toBe('- [ ] a\n- [ ] \n- [x] b\n');
    expect(tr.doc.resolve(curseur).parent.type.name).toBe('paragraph');
    expect(tr.doc.resolve(curseur).node(-1).type.name).toBe('taskItem');
    // Une seconde demande reprend la même tâche vide.
    expect(ouvrirNouvelleTache(tr)).toBe(curseur);
    expect(tr.doc.child(0).childCount).toBe(3);
  });

  it('sur une page vide, le curseur reste dans le paragraphe', () => {
    const tr = new Transform(lireMarkdown('').document);
    expect(ouvrirNouvelleTache(tr)).toBe(1);
    expect(tr.steps).toHaveLength(0);
  });
});

describe('rangement des tâches cochées', () => {
  it('descend les tâches cochées en bas, dans leur ordre, avec leurs sous-tâches', () => {
    expect(appliquer('- [x] a\n  - [ ] a1\n- [ ] b\n- [x] c\n- [ ] d\n', rangerTaches)).toBe('- [ ] b\n- [ ] d\n- [x] a\n  - [ ] a1\n- [x] c\n');
  });

  it('les rassemble dans la dernière liste, et retire une liste vidée', () => {
    expect(appliquer('- [x] a\n\n# Suite\n\n- [ ] b\n', rangerTaches)).toBe('# Suite\n\n- [ ] b\n- [x] a\n');
  });

  it('ne bouge pas une sous-tâche cochée', () => {
    const corps = '- [ ] a\n  - [x] a1\n  - [ ] a2\n';
    expect(appliquer(corps, rangerTaches)).toBe(corps);
  });
});

describe('cocher une tâche', () => {
  it('en mode liste, la tâche cochée passe en tête de « Terminé »', () => {
    expect(appliquer('- [ ] a\n- [ ] b\n- [x] c\n', (tr) => basculerTache(tr, tache(tr, 'a'), true, true))).toBe('- [ ] b\n- [x] a\n- [x] c\n');
  });

  it('décochée, elle revient après les tâches à faire', () => {
    expect(appliquer('- [ ] a\n- [x] b\n- [x] c\n', (tr) => basculerTache(tr, tache(tr, 'c'), false, true))).toBe('- [ ] a\n- [ ] c\n- [x] b\n');
  });

  it('hors mode liste, seule la case change', () => {
    expect(appliquer('- [ ] a\n- [ ] b\n', (tr) => basculerTache(tr, tache(tr, 'a'), true, false))).toBe('- [x] a\n- [ ] b\n');
  });

  it("refuse ce qui n'est pas une tâche, ou déjà dans cet état", () => {
    const tr = new Transform(lireMarkdown('- [x] a\n\nTexte\n').document);
    expect(basculerTache(tr, tache(tr, 'a'), true, true)).toBe(false);
    expect(basculerTache(tr, tr.doc.child(0).nodeSize, true, true)).toBe(false);
  });
});

describe('ajout rapide', () => {
  it('ajoute en tête de la dernière liste, texte pris tel quel', () => {
    let fin: number | null = null;
    const sortie = appliquer('# Courses\n\n- [ ] pain\n- [x] lait\n', (tr) => {
      fin = ajouterTache(tr, '  **beurre**  ');
      expect(tr.doc.textBetween(fin! - 10, fin!)).toBe('**beurre**');
    });
    expect(sortie).toBe('# Courses\n\n- [ ] \\*\\*beurre\\*\\*\n- [ ] pain\n- [x] lait\n');
  });

  it('crée la liste si la page n’en a pas, à la place du paragraphe vide de fin', () => {
    expect(appliquer('# Titre\n', (tr) => ajouterTache(tr, 'pain'))).toBe('# Titre\n\n- [ ] pain\n');
  });

  it('ignore un texte vide', () => {
    const tr = new Transform(lireMarkdown('- [ ] a\n').document);
    expect(ajouterTache(tr, '   ')).toBeNull();
    expect(tr.steps).toHaveLength(0);
  });
});

describe('section « Terminé »', () => {
  it('reprend les tâches cochées qui terminent la dernière liste', () => {
    const { document } = lireMarkdown('- [x] a\n\n# B\n\n- [x] b\n- [ ] c\n- [x] d\n- [x] e\n');
    const positions = sectionTerminee(document);
    expect(positions.map((position) => document.nodeAt(position)?.textContent)).toEqual(['d', 'e']);
  });

  it('est vide sans tâche cochée en fin de liste', () => {
    expect(sectionTerminee(lireMarkdown('- [x] a\n- [ ] b\n').document)).toEqual([]);
    expect(sectionTerminee(lireMarkdown('Texte\n').document)).toEqual([]);
  });
});
