import { describe, expect, it } from 'vitest';
import { assemblerTexte, assemblerVersions, comparerVersions } from './conflict';

const a = ['## Semaine', '', 'Sortie longue dimanche : 18 km à 4:50, puis footing.', '', '- Mardi : 10 × 400 m', '', 'Jeudi : 3 × 3 km', '', '```', 'allure = 3:58', '```', ''].join('\n');
const b = ['## Semaine', '', 'Sortie longue dimanche : 20 km dont 5 à allure semi, puis footing.', '', '- Mardi : 10 × 400 m', '', '* [ ] Acheter des gels', '', '```', 'allure = 3:56', '```', ''].join('\n');

describe('comparerVersions', () => {
  it('rend une page identique en blocs tous pareils', () => {
    expect(comparerVersions(a, a).every((ligne) => ligne.genre === 'pareil')).toBe(true);
  });

  it('apparie les blocs identiques et isole ce qui diffère', () => {
    const lignes = comparerVersions(a, b);
    expect(lignes.map((ligne) => ligne.genre)).toEqual(['pareil', 'texte', 'pareil', 'bloc', 'bloc']);
    expect(lignes[1]).toEqual({ genre: 'texte', avant: ['Sortie', 'longue', 'dimanche', ':'], a: '18 km à 4:50,', b: '20 km dont 5 à allure semi,', apres: ['puis', 'footing.'] });
    // Un paragraphe et une liste ne se comparent pas mot à mot.
    expect(lignes[3]).toEqual({ genre: 'bloc', a: 'Jeudi : 3 × 3 km', b: '* [ ] Acheter des gels' });
    expect(lignes[4]).toEqual({ genre: 'bloc', a: '```\nallure = 3:58\n```', b: '```\nallure = 3:56\n```' });
  });

  it('garde seul un bloc présent d’un seul côté', () => {
    const lignes = comparerVersions('Un\n\nDeux\n', 'Un\n\nAjouté\n\nDeux\n');
    expect(lignes).toEqual([
      { genre: 'pareil', texte: 'Un' },
      { genre: 'bloc', a: null, b: 'Ajouté' },
      { genre: 'pareil', texte: 'Deux' },
    ]);
  });

  it('voit un ajout à la fin d’un paragraphe comme un passage vide d’un côté', () => {
    expect(comparerVersions('Bonjour le monde\n', 'Bonjour le monde entier\n')).toEqual([{ genre: 'texte', avant: ['Bonjour', 'le', 'monde'], a: '', b: 'entier', apres: [] }]);
  });

  it('compare en entier deux titres qui n’ont que leurs « # » en commun', () => {
    expect(comparerVersions('## Lundi\n', '## Mardi\n')).toEqual([{ genre: 'bloc', a: '## Lundi', b: '## Mardi' }]);
    expect(comparerVersions('## Lundi matin\n', '### Lundi matin\n')[0]?.genre).toBe('bloc');
  });

  it('redonne chaque version à partir de ses mots', () => {
    const ligne = comparerVersions(a, b)[1];
    if (ligne?.genre !== 'texte') {
      throw new Error('ligne de texte attendue');
    }
    expect(assemblerTexte([...ligne.avant, ligne.a, ...ligne.apres])).toBe('Sortie longue dimanche : 18 km à 4:50, puis footing.');
    expect(assemblerTexte([...ligne.avant, ligne.b, ...ligne.apres])).toBe('Sortie longue dimanche : 20 km dont 5 à allure semi, puis footing.');
  });
});

describe('assemblerVersions', () => {
  it('rend une des deux versions à l’octet près quand on la prend entière', () => {
    const avecCrlf = 'Un\r\n\r\n\r\nDeux\r\n';
    expect(assemblerVersions(['Un', 'Deux'], avecCrlf, b)).toBe(avecCrlf);
  });

  it('sépare les blocs par une ligne vide, dans la fin de ligne de la page', () => {
    expect(assemblerVersions(['Un', 'Deux'], 'Trois\r\n', 'Quatre\n')).toBe('Un\r\n\r\nDeux\r\n');
    expect(assemblerVersions([], 'Un\n', 'Deux\n')).toBe('');
  });

  it('garde en une seule liste deux listes de même sorte mises l’une après l’autre', () => {
    expect(assemblerVersions(['- Jeudi A', '- Jeudi B', '1. Un', 'Fin'], 'x\n', 'y\n')).toBe('- Jeudi A\n- Jeudi B\n\n1. Un\n\nFin\n');
  });
});

describe('passages d’un paragraphe', () => {
  it('vont d’une ponctuation à l’autre', () => {
    expect(comparerVersions('Chaussures : les Vaporfly pour la course, les Pegasus pour le reste.\n', 'Chaussures : les Endorphin pour la course, les Pegasus pour le reste.\n')).toEqual([
      { genre: 'texte', avant: ['Chaussures', ':'], a: 'les Vaporfly pour la course,', b: 'les Endorphin pour la course,', apres: ['les', 'Pegasus', 'pour', 'le', 'reste.'] },
    ]);
  });

  it('restent au mot près sans ponctuation commune', () => {
    expect(comparerVersions('Courir lentement le lundi\n', 'Courir vite le lundi\n')).toEqual([{ genre: 'texte', avant: ['Courir'], a: 'lentement', b: 'vite', apres: ['le', 'lundi'] }]);
  });
});
