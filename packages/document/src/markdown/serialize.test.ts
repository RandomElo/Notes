import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { describe, expect, it } from 'vitest';
import { schema } from '../schema/extensions';
import { lireMarkdown } from './parse';
import { ecrireMarkdown } from './serialize';

const paragraphe = (texte: string): ProseMirrorNode => schema.nodeFromJSON({ type: 'paragraph', content: [{ type: 'text', text: texte }] });
const noeud = (json: unknown): ProseMirrorNode => schema.nodeFromJSON(json);

/** Applique une modification à la liste des blocs d'une page, comme le ferait l'éditeur, et rend le Markdown écrit. */
function modifier(corps: string, changer: (blocs: ProseMirrorNode[]) => ProseMirrorNode[]): string {
  const { document, source } = lireMarkdown(corps);
  const blocs: ProseMirrorNode[] = [];
  document.forEach((bloc) => blocs.push(bloc));
  return ecrireMarkdown(schema.topNodeType.create(null, changer(blocs)), source);
}

const blocsDe = (corps: string): unknown => lireMarkdown(corps).document.toJSON();

describe('ecrireMarkdown, page non modifiée', () => {
  it.each([
    ['fins de ligne Windows', '# Titre\r\n\r\ntexte\r\n'],
    ['sans fin de ligne finale', 'texte'],
    ['lignes vides en trop', '\n\n\ntexte\n\n\n\nautre\n\n\n'],
    ['espaces en fin de ligne', 'texte   \n\n- puce \n'],
    ['syntaxe d’un autre outil', '* a\n* b\n\nTitre\n=====\n\n__gras__ et _italique_\n'],
    ['corps fait de lignes vides', '\n\n'],
    ['code jamais fermé', '```\ncode\n\n'],
  ])('%s : pas un octet ne change', (_nom, corps) => {
    const { document, source } = lireMarkdown(corps);
    expect(ecrireMarkdown(document, source)).toBe(corps);
  });

  it('reste identique même si le document est reconstruit à l’identique', () => {
    const corps = '* a\n\nTitre\n=====\n';
    const { document, source } = lireMarkdown(corps);
    expect(ecrireMarkdown(schema.nodeFromJSON(document.toJSON()), source)).toBe(corps);
  });
});

describe('ecrireMarkdown, page modifiée', () => {
  const corps = '* a\n* b\n\n\nTitre\n=====\n\ndu _texte_\n';

  it('ne réécrit que le bloc modifié', () => {
    expect(modifier(corps, ([liste, titre]) => [liste!, titre!, paragraphe('nouveau texte')])).toBe(
      '* a\n* b\n\n\nTitre\n=====\n\nnouveau texte\n',
    );
  });

  it('ajoute un bloc à la fin, au milieu, au début', () => {
    expect(modifier(corps, (blocs) => [...blocs, paragraphe('fin')])).toBe('* a\n* b\n\n\nTitre\n=====\n\ndu _texte_\n\nfin\n');
    expect(modifier(corps, ([liste, ...reste]) => [liste!, paragraphe('milieu'), ...reste])).toBe(
      '* a\n* b\n\nmilieu\n\nTitre\n=====\n\ndu _texte_\n',
    );
    expect(modifier(corps, (blocs) => [paragraphe('début'), ...blocs])).toBe('début\n\n* a\n* b\n\n\nTitre\n=====\n\ndu _texte_\n');
  });

  it('supprime un bloc sans toucher aux autres', () => {
    expect(modifier(corps, ([liste, , texte]) => [liste!, texte!])).toBe('* a\n* b\n\ndu _texte_\n');
  });

  it('déplace un bloc en gardant son texte d’origine', () => {
    expect(modifier(corps, ([liste, titre, texte]) => [titre!, liste!, texte!])).toBe('Titre\n=====\n\n* a\n* b\n\ndu _texte_\n');
  });

  it('rend un corps vide quand tout est supprimé', () => {
    expect(modifier(corps, () => [schema.nodes['paragraph']!.create()])).toBe('');
  });

  it('écrit les nouveaux blocs avec la fin de ligne du fichier', () => {
    expect(modifier('a\r\n\r\nb\r\n', (blocs) => [...blocs, noeud({ type: 'blockquote', content: [paragraphe('c\nd').toJSON()] })])).toBe(
      'a\r\n\r\nb\r\n\r\n> c\r\n> d\r\n',
    );
  });

  it('termine par une fin de ligne quand un bloc est ajouté à un fichier qui n’en avait pas', () => {
    expect(modifier('texte', (blocs) => [...blocs, paragraphe('suite')])).toBe('texte\n\nsuite\n');
    // Le dernier bloc n'a pas bougé : la fin du fichier non plus.
    expect(modifier('texte\n\nfin', (blocs) => [paragraphe('autre'), blocs[1]!])).toBe('autre\n\nfin');
  });

  it('n’écrit pas les paragraphes vides', () => {
    const vide = schema.nodes['paragraph']!.create();
    expect(modifier('a\n\nb\n', ([a, b]) => [a!, vide, vide, b!, vide])).toBe('a\n\nb\n');
    expect(modifier('', () => [vide])).toBe('');
    expect(modifier('\n\n', () => [vide])).toBe('\n\n');
    expect(modifier('\n\n', () => [paragraphe('premier texte')])).toBe('premier texte\n');
  });

  it('ne réécrit pas toute la page pour une espace en fin de gras', () => {
    // En cours de frappe, le gras englobe souvent l'espace qui suit le mot.
    const gras = noeud({ type: 'paragraph', content: [{ type: 'text', text: 'mot ', marks: [{ type: 'bold' }] }, { type: 'text', text: 'suite' }] });
    expect(modifier(corps, (blocs) => [...blocs, gras])).toBe('* a\n* b\n\n\nTitre\n=====\n\ndu _texte_\n\n**mot** suite\n');
  });

  it('ne perd pas la suite d’un texte marqué qui commence par une espace et tient sur deux lignes', () => {
    const souligne = noeud({ type: 'paragraph', content: [{ type: 'text', text: 'un' }, { type: 'text', text: ' deux\ntrois ', marks: [{ type: 'underline' }] }] });
    expect(modifier('a\n', () => [souligne])).toBe('un <u>deux\ntrois</u>\n');
  });

  it('garde tels quels les blocs non gérés quand leur voisin change', () => {
    const page = 'texte\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n[ref]: https://example.com\n\nfin\n';
    expect(modifier(page, ([, ...reste]) => [paragraphe('changé'), ...reste])).toBe(
      'changé\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n[ref]: https://example.com\n\nfin\n',
    );
  });

  it('change de marqueur pour qu’une liste ajoutée ne se fonde pas dans la précédente', () => {
    const taches = noeud({ type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [paragraphe('tâche').toJSON()] }] });
    const ecrit = modifier('- puce\n', (blocs) => [...blocs, taches]);
    expect(ecrit).toBe('- puce\n\n* [ ] tâche\n');
    expect(blocsDe(ecrit)).toMatchObject({ content: [{ type: 'bulletList' }, { type: 'taskList' }] });
    // Après une liste en étoiles, c'est le tiret qui convient.
    expect(modifier('* puce\n', (blocs) => [...blocs, taches])).toBe('* puce\n\n- [ ] tâche\n');
  });

  it('réécrit tout plutôt que de laisser deux blocs d’origine changer de sens en devenant voisins', () => {
    // Sans le paragraphe du milieu, les deux listes seraient relues comme une seule.
    const ecrit = modifier('- a\n\ntexte\n\n- b\n', ([a, , b]) => [a!, b!]);
    expect(blocsDe(ecrit)).toMatchObject({ content: [{ type: 'bulletList' }, { type: 'bulletList' }] });
    expect(ecrit).toBe('- a\n\n* b\n');
  });

  it('ne laisse pas un bloc de code jamais fermé avaler ce qui est ajouté après', () => {
    const ecrit = modifier('```\ncode\n', (blocs) => [...blocs, paragraphe('après')]);
    expect(ecrit).toBe('```\ncode\n```\n\naprès\n');
  });

  it('écrit tout en forme canonique sans source', () => {
    expect(ecrireMarkdown(lireMarkdown(corps).document)).toBe('- a\n- b\n\n# Titre\n\ndu *texte*\n');
  });
});
