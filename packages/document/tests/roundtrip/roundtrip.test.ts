import { describe, expect, it } from 'vitest';
import { ecrireMarkdown, lireMarkdown } from '../../src/index';

/**
 * Cas d'aller-retour : un fichier `cases/<nom>.md` par cas. S'il existe un
 * `<nom>.canonique.md`, c'est ce que l'application écrit quand elle réécrit
 * tout le fichier ; sinon le cas est déjà en forme canonique.
 */
const fichiers = import.meta.glob('./cases/*.md', { query: '?raw', import: 'default', eager: true });
const pagesDExemple = import.meta.glob('../../../../fixtures/vault-demo/**/*.md', { query: '?raw', import: 'default', eager: true });

const cas = Object.entries(fichiers)
  .filter(([chemin]) => !chemin.endsWith('.canonique.md'))
  .map(([chemin, texte]) => ({
    nom: chemin.replace('./cases/', '').replace(/\.md$/, ''),
    texte,
    canonique: fichiers[chemin.replace(/\.md$/, '.canonique.md')] ?? texte,
  }));

describe('aller-retour Markdown', () => {
  it('trouve les cas', () => {
    expect(cas.length).toBeGreaterThanOrEqual(8);
  });

  describe.each(cas)('$nom', ({ texte, canonique }) => {
    it('ne change pas un octet quand rien n’est modifié', () => {
      const { document, source } = lireMarkdown(texte);
      expect(ecrireMarkdown(document, source)).toBe(texte);
    });

    it('donne la forme canonique attendue quand tout est réécrit', () => {
      expect(ecrireMarkdown(lireMarkdown(texte).document)).toBe(canonique);
    });

    it('relit sa forme canonique comme le même document', () => {
      const { document } = lireMarkdown(texte);
      const relu = lireMarkdown(ecrireMarkdown(document));
      expect(relu.document.toJSON()).toEqual(document.toJSON());
      // Et la forme canonique est stable : la réécrire ne la change plus.
      expect(ecrireMarkdown(relu.document)).toBe(canonique);
    });

    it('produit un document valide pour le schéma', () => {
      expect(() => lireMarkdown(texte).document.check()).not.toThrow();
    });
  });
});

describe('vault d’exemple', () => {
  const pages = Object.entries(pagesDExemple);

  it('contient des pages', () => {
    expect(pages.length).toBeGreaterThanOrEqual(8);
  });

  it.each(pages)('%s ressort à l’identique', (_chemin, texte) => {
    // Le fichier entier, en-tête compris, et son corps seul : aucun des deux ne doit bouger.
    const corps = texte.replace(/^---\n[\s\S]*?\n---\n/, '');
    for (const entree of [texte, corps]) {
      const { document, source } = lireMarkdown(entree);
      expect(ecrireMarkdown(document, source)).toBe(entree);
    }
  });

  it('lit la page Bienvenue avec tous ses blocs', () => {
    const bienvenue = pages.find(([chemin]) => chemin.endsWith('Bienvenue/page.md'))?.[1] ?? '';
    const { document } = lireMarkdown(bienvenue.replace(/^---\n[\s\S]*?\n---\n/, ''));
    const types: string[] = [];
    document.forEach((bloc) => types.push(bloc.type.name));
    expect(types).toEqual([
      'heading', 'paragraph', 'heading', 'paragraph', 'paragraph', 'heading', 'bulletList', 'orderedList', 'taskList',
      'heading', 'blockquote', 'horizontalRule', 'heading', 'codeBlock', 'rawBlock', 'codeBlock',
    ]);
  });
});
