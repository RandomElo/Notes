import { describe, expect, it } from 'vitest';
import { ecrireMarkdown, lireMarkdown } from '../../src/index';

/** Générateur pseudo-aléatoire à graine fixe : les mêmes textes à chaque lancement. */
function generateur(graine: number): () => number {
  let etat = graine;
  return () => {
    etat = (etat * 1664525 + 1013904223) % 4294967296;
    return etat / 4294967296;
  };
}

const lignes = [
  '', '', '', '   ', '# Titre', '## Titre *en italique*', '###### six', 'Titre', '===', '---', '***', '- puce', '  - sous-puce', '* étoile',
  '+ plus', '1. un', '2) deux', '- [ ] tâche', '- [x] faite', '  suite de puce', '> citation', '> - puce citée', '```', '```ts', '~~~',
  '    code indenté', 'texte **gras** et _italique_', 'un `code` et ==surligné==', '[lien](https://example.com "titre")', '![image](a.png)',
  '![légende](assets/é t.png#largeur=33&align=droite "titre")', '![x](a.png#largeur=50)', '| a | b |', '|---|---|', '|:-:|--:|',
  '| `x\\|y` | **g** \\| |', '| seul |', '```notes-callout', 'type: info', 'icon: 💡', 'text: |-', '  du **texte**', 'text: une ligne', '[ref]: https://example.com', 'texte [ref] et <https://example.com>', '<div>html</div>', 'fin de ligne  ',
  'barre oblique\\', '\\* échappé \\# \\[x\\]', 'snake_case __init__ a*b*c', '&amp; &#35; =', 'du <u>souligné</u> et <u>*les deux*</u>', 'un <u> seul', '</u> perdu', '\ttabulation', '1.', '-', '>', '#', 'é à ü 👋 «»',
];

function texteAleatoire(alea: () => number): string {
  const nombre = Math.floor(alea() * 14);
  const finDeLigne = alea() < 0.15 ? '\r\n' : '\n';
  let texte = '';
  for (let i = 0; i < nombre; i++) {
    texte += lignes[Math.floor(alea() * lignes.length)] + finDeLigne;
  }
  return alea() < 0.2 ? texte.slice(0, -finDeLigne.length) : texte;
}

describe('aller-retour sur des textes aléatoires', () => {
  const alea = generateur(20261002);
  const textes = Array.from({ length: 3000 }, () => texteAleatoire(alea));

  it('ne change jamais un octet quand rien n’est modifié', () => {
    for (const texte of textes) {
      const { document, source } = lireMarkdown(texte);
      expect(source.prefixe + source.blocs.map((bloc) => bloc.texte + bloc.separateur).join(''), JSON.stringify(texte)).toBe(texte);
      expect(ecrireMarkdown(document, source), JSON.stringify(texte)).toBe(texte);
      expect(() => document.check()).not.toThrow();
    }
  });

  it('relit toujours ce qu’il réécrit en entier comme le même document', () => {
    const echecs: string[] = [];
    for (const texte of textes) {
      const { document } = lireMarkdown(texte);
      const canonique = ecrireMarkdown(document);
      const relu = lireMarkdown(canonique).document;
      // Les paragraphes vides ne sont pas écrits : la comparaison porte sur le Markdown produit, stable d'une écriture à l'autre.
      if (ecrireMarkdown(relu) !== canonique) {
        echecs.push(`${JSON.stringify(texte)}\n  → ${JSON.stringify(canonique)}\n  → ${JSON.stringify(ecrireMarkdown(relu))}`);
      }
    }
    expect(echecs.slice(0, 15).join('\n\n')).toBe('');
  });

  it('ne perd aucun texte quand un bloc est ajouté, retiré ou déplacé', () => {
    const echecs: string[] = [];
    for (const texte of textes.slice(0, 1500)) {
      const { document, source } = lireMarkdown(texte);
      const blocs: (typeof document)[] = [];
      document.forEach((bloc) => blocs.push(bloc));
      const variantes = [blocs.slice(1), blocs.slice(0, -1), [...blocs.slice(1), ...blocs.slice(0, 1)], [...blocs].reverse()];
      for (const variante of variantes) {
        if (variante.length === 0) {
          continue;
        }
        const modifie = document.type.create(null, variante);
        const ecrit = ecrireMarkdown(modifie, source);
        // Ce qui est écrit doit se relire comme le document modifié, ou au pire comme sa réécriture complète.
        if (ecrireMarkdown(lireMarkdown(ecrit).document) !== ecrireMarkdown(lireMarkdown(ecrireMarkdown(modifie)).document)) {
          echecs.push(`${JSON.stringify(texte)}\n  → ${JSON.stringify(ecrit)}`);
        }
      }
    }
    expect(echecs.slice(0, 10).join('\n\n')).toBe('');
  });
});
