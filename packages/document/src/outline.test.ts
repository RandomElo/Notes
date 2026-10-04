import { describe, expect, it } from 'vitest';
import { lireMarkdown } from './markdown/parse';
import { extraireSommaire } from './outline';

const sommaire = (corps: string) => extraireSommaire(lireMarkdown(corps).document).map(({ niveau, profondeur, texte }) => ({ niveau, profondeur, texte }));

describe('extraireSommaire', () => {
  it('rend les titres dans l’ordre, avec leur emboîtement', () => {
    expect(sommaire('# Un\n\ntexte\n\n## Un point un\n\n### Détail\n\n## Un point deux\n\n# Deux\n')).toEqual([
      { niveau: 1, profondeur: 0, texte: 'Un' },
      { niveau: 2, profondeur: 1, texte: 'Un point un' },
      { niveau: 3, profondeur: 2, texte: 'Détail' },
      { niveau: 2, profondeur: 1, texte: 'Un point deux' },
      { niveau: 1, profondeur: 0, texte: 'Deux' },
    ]);
  });

  it('un niveau sauté ne descend que d’un cran', () => {
    expect(sommaire('# Haut\n\n### Bas\n\n#### Plus bas\n\n## Milieu\n')).toEqual([
      { niveau: 1, profondeur: 0, texte: 'Haut' },
      { niveau: 3, profondeur: 1, texte: 'Bas' },
      { niveau: 4, profondeur: 2, texte: 'Plus bas' },
      { niveau: 2, profondeur: 1, texte: 'Milieu' },
    ]);
  });

  it('une page qui commence plus bas que le niveau 1 a ses titres à la racine', () => {
    expect(sommaire('### A\n\n### B\n').map((entree) => entree.profondeur)).toEqual([0, 0]);
  });

  it('garde le texte sans mise en forme et ignore ce qui n’est pas un titre', () => {
    expect(sommaire('Paragraphe\n\n## Un **titre** en `code`\n\n- liste\n')).toEqual([{ niveau: 2, profondeur: 0, texte: 'Un titre en code' }]);
    expect(sommaire('Rien que du texte\n')).toEqual([]);
  });

  it('donne la position du titre dans le document', () => {
    const { document } = lireMarkdown('Intro\n\n## Titre\n');
    const [entree] = extraireSommaire(document);
    expect(document.nodeAt(entree?.position ?? -1)?.type.name).toBe('heading');
  });
});
