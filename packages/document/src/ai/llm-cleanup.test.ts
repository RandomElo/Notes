import { describe, expect, it } from 'vitest';
import { lireMarkdown } from '../markdown/parse';
import { nettoyerSortie } from './llm-cleanup';
import { mettreDeCote, remettreEnPlace } from './reserved-blocks';

const nettoyer = (sortie: string, entree = 'Un paragraphe.\n', reserves: string[] = [], titre = 'Ma page') => nettoyerSortie({ sortie, entree, reserves, titre });

describe('blocs mis de côté', () => {
  const page = [
    'Intro avec du `code en ligne`.',
    '',
    '```ts',
    'const a = 1;',
    '',
    '',
    'const b = 2;',
    '```',
    '',
    '![Schéma](assets/schema.webp#largeur=50 "Légende")',
    '',
    '```notes-callout',
    'type: info',
    '---',
    'Texte du callout.',
    '```',
    '',
    'Fin.',
    '',
  ].join('\n');

  it('remplace code, callouts et images par des repères, et les remet octet pour octet', () => {
    const { texte, reserves } = mettreDeCote(page);
    expect(reserves).toHaveLength(3);
    expect(texte).toBe('Intro avec du `code en ligne`.\n\n[[BLOC-1]]\n\n[[BLOC-2]]\n\n[[BLOC-3]]\n\nFin.\n');
    expect(nettoyerSortie({ sortie: texte, entree: texte, reserves, titre: 'x' }).markdown).toBe(page);
  });

  it('remet à la fin un bloc dont le repère a disparu, et le dit', () => {
    const { texte, reserves } = mettreDeCote(page);
    const resultat = nettoyerSortie({ sortie: texte.replace('[[BLOC-2]]', ''), entree: texte, reserves, titre: 'x' });
    expect(resultat.markdown.trimEnd().endsWith(reserves[1]!)).toBe(true);
    expect(resultat.avertissements).toEqual(['Le modèle a laissé de côté un bloc (code, callout ou image) : il est remis à la fin de la page.']);
  });

  it('accepte un repère enrobé par le modèle ou glissé dans une phrase', () => {
    expect(remettreEnPlace('- **[[BLOC-1]]**', ['```\nx\n```']).texte).toBe('\n```\nx\n```\n');
    expect(remettreEnPlace('Voir [[BLOC-1]] ci-dessous.', ['![a](b.png)']).texte).toBe('Voir ci-dessous.\n\n![a](b.png)\n');
  });

  it('un bloc fencé jamais fermé va jusqu’à la fin', () => {
    expect(mettreDeCote('a\n\n```\nb\n\nc').reserves).toEqual(['```\nb\n\nc']);
  });
});

describe('nettoyage des sorties du modèle', () => {
  it('retire le fence qui englobe tout, la réflexion, le préambule et la conclusion', () => {
    const sortie = [
      '<think>',
      'Je dois relire le texte.',
      '</think>',
      'Voici la version relue de votre texte :',
      '',
      '```markdown',
      'Le texte relu.',
      '',
      'Un second paragraphe.',
      '```',
    ].join('\n');
    // Le préambule est hors du fence : une fois le fence et le préambule ôtés, il reste le contenu.
    expect(nettoyer(sortie.replace('```markdown', '').replace(/```$/, '')).markdown).toBe('Le texte relu.\n\nUn second paragraphe.\n');
    expect(nettoyer('```markdown\nLe texte relu.\n```').markdown).toBe('Le texte relu.\n');
    expect(nettoyer(sortie).markdown).toBe('Le texte relu.\n\nUn second paragraphe.\n');
    expect(nettoyer('Bien sûr ! Voici le texte :\n\nLe texte.\n\nJ’ai corrigé les accords.\n\nN’hésitez pas à me demander d’autres modifications.'.replace(/’/g, "'")).markdown).toBe('Le texte.\n');
  });

  it('garde une phrase de l’entrée qui ressemble à un préambule', () => {
    const entree = 'Voici mes notes du jour.\n\nSuite.\n';
    expect(nettoyer(entree, entree).markdown).toBe(entree);
  });

  it('retire les séparateurs ajoutés, pas un titre souligné', () => {
    expect(nettoyer('Un.\n\n---\n\nDeux.\n\n***\n\nTitre\n---\n').markdown).toBe('Un.\n\nDeux.\n\nTitre\n---\n');
  });

  it('ramène les puces à « - »', () => {
    expect(nettoyer('* un\n  + deux\n• trois\n').markdown).toBe('- un\n  - deux\n- trois\n');
  });

  it('remet les titres d’aplomb : titre de page répété, niveau de départ, sauts de niveau, au plus 5', () => {
    expect(nettoyer('# Ma page\n\nIntro.\n\n## Partie\n\n#### Détail\n').markdown).toBe('Intro.\n\n# Partie\n\n## Détail\n');
    expect(nettoyer('# A\n\n### B\n\n###### C\n', '## X\n\ntexte\n').markdown).toBe('## A\n\n### B\n\n#### C\n');
    expect(nettoyer('# A\n## B\n### C\n#### D\n##### E\n###### F\n').markdown).toBe('# A\n## B\n### C\n#### D\n##### E\n##### F\n');
  });

  it('retire emojis et gras ajoutés, garde ceux de l’entrée', () => {
    const entree = 'Le **point clé** reste. Bravo 🎉\n';
    expect(nettoyer('## 🚀 Lancement\n\n- ✅ Fait\n\nLe **point clé** reste. **Important** : Bravo 🎉 🔥\n', entree).markdown).toBe(
      '# Lancement\n\n- Fait\n\nLe **point clé** reste. Important : Bravo 🎉\n',
    );
  });

  it('ne touche jamais un bloc de code écrit par le modèle', () => {
    const code = '```bash\n* pas une puce\n\n\n\n**pas du gras** 🚀\n---\n```';
    expect(nettoyer(`Texte.\n\n${code}\n`).markdown).toBe(`Texte.\n\n${code}\n`);
  });

  it('signale une mention de page disparue', () => {
    const entree = 'Voir [Projet](notes://0192a0b0-0000-7000-8000-000000000001).\n';
    expect(nettoyer('Voir le projet.\n', entree).avertissements).toEqual(['Une mention de page a disparu dans la proposition.']);
  });

  it('prévient quand une relecture rend nettement moins de texte', () => {
    const entree = 'Un deux trois quatre cinq six sept huit neuf dix.\n\n[[BLOC-1]]\n';
    const court = nettoyerSortie({ sortie: 'Un deux trois quatre cinq six sept huit.\n\n[[BLOC-1]]', entree, reserves: ['```\nx\n```'], titre: 'x', memeLongueur: true });
    expect(court.avertissements).toEqual(['La proposition a 20 % de mots en moins que la page : le modèle a peut-être retiré du texte. Vérifie avant d’accepter.']);
    expect(nettoyerSortie({ sortie: 'Un deux trois quatre cinq six sept huit neuf.\n\n[[BLOC-1]]', entree, reserves: ['```\nx\n```'], titre: 'x', memeLongueur: true }).avertissements).toEqual([]);
    // Une mise au propre peut raccourcir autant qu'elle veut.
    expect(nettoyerSortie({ sortie: 'Un.\n\n[[BLOC-1]]', entree, reserves: ['```\nx\n```'], titre: 'x' }).avertissements).toEqual([]);
  });

  it('rend un Markdown que l’éditeur lit', () => {
    const { markdown } = nettoyer('Voici :\n\n# Notes\n\n* a\n* **b**\n\n---\n\nFin 👍\n');
    expect(() => lireMarkdown(markdown)).not.toThrow();
  });
});
