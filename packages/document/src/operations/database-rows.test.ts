import { describe, expect, it } from 'vitest';
import { lireMarkdown } from '../markdown/parse';
import { ajouterLigne, changerLigne, changerLignesDuCorps, corpsDuTexte, ligneA, lireLignesDuTableau, tableauDesLignes, texteDeCellule } from './database-rows';
import type { TableRow } from './database-rows';
import type { DatabaseColumn } from './database-table';

const colonnes: DatabaseColumn[] = [
  { nom: 'Type', type: 'choix', choix: [{ nom: 'Code' }] },
  { nom: 'Fait', type: 'case' },
  { nom: 'Durée', type: 'nombre' },
  { nom: 'Description', type: 'texte' },
];
const lignes: TableRow[] = [
  { titre: 'Notes | app', valeurs: { Type: 'Code', Durée: '2.5' }, enfants: [{ titre: 'Finir *vite*', valeurs: { Fait: 'true', Description: 'avant [lundi]' }, enfants: [] }] },
  { titre: 'Courses', valeurs: { Durée: '1234.5' }, enfants: [] },
];

describe('base sans pages', () => {
  it('écrit les lignes dans le tableau, titres en texte, et les relit à l’identique', () => {
    const markdown = tableauDesLignes(colonnes, lignes);
    expect(markdown.split('\n').slice(0, 3)).toEqual(['| Page | Type | Fait | Durée | Description |', '| --- | --- | --- | --- | --- |', '| Notes \\| app | Code |  | 2,5 |  |']);
    expect(markdown).toContain('| ↳ Finir \\*vite\\* |  | ✓ |  | avant \\[lundi\\] |');
    const relues = lireLignesDuTableau(lireMarkdown(`Texte avant.\n\n${markdown}\n`).document, colonnes);
    expect(relues).toEqual(lignes);
  });

  it('lit une base vide, et une colonne inconnue comme du texte', () => {
    expect(lireLignesDuTableau(lireMarkdown(`${tableauDesLignes(colonnes, [])}\n`).document, colonnes)).toEqual([]);
    expect(lireLignesDuTableau(lireMarkdown('| Page | Autre |\n| --- | --- |\n| A | 2,5 |\n').document, colonnes)).toEqual([{ titre: 'A', valeurs: { Autre: '2,5' }, enfants: [] }]);
    expect(lireLignesDuTableau(lireMarkdown('Rien.\n').document, colonnes)).toEqual([]);
  });

  it('ajoute, change et retire une ligne par sa place dans l’arbre', () => {
    let arbre = ajouterLigne(lignes, '0', ' Relire ');
    expect(ligneA(arbre, '0/1')?.titre).toBe('Relire');
    arbre = changerLigne(arbre, '0/1', (ligne) => ({ ...ligne, valeurs: { Fait: 'true' } }));
    expect(ligneA(arbre, '0/1')?.valeurs).toEqual({ Fait: 'true' });
    arbre = changerLigne(arbre, '0', () => null);
    expect(arbre.map((ligne) => ligne.titre)).toEqual(['Courses']);
    expect(ligneA(arbre, '3')).toBeUndefined();
  });

  it('change les lignes dans un corps sans toucher au texte autour', () => {
    const corps = `Avant.\n\n${tableauDesLignes(colonnes, lignes)}\n\nAprès.\n`;
    const nouveau = changerLignesDuCorps(corps, colonnes, (actuelles) => ajouterLigne(actuelles, null, 'Vélo'))!;
    expect(nouveau.startsWith('Avant.\n\n| Page')).toBe(true);
    expect(nouveau.endsWith('\n\nAprès.\n')).toBe(true);
    expect(lireLignesDuTableau(lireMarkdown(nouveau).document, colonnes).map((ligne) => ligne.titre)).toEqual(['Notes | app', 'Courses', 'Vélo']);
    expect(changerLignesDuCorps(corps, colonnes, () => null)).toBeNull();
  });

  it('dit si le texte d’une page tient dans une cellule, et refait un corps depuis ce texte', () => {
    expect(texteDeCellule('')).toBe('');
    expect(texteDeCellule('\n\n')).toBe('');
    expect(texteDeCellule('Avant **lundi**, sans faute.\n')).toBe('Avant lundi, sans faute.');
    expect(texteDeCellule('Un.\n\nDeux.\n')).toBeNull();
    expect(texteDeCellule('- une liste\n')).toBeNull();
    expect(texteDeCellule('Voir [ici](https://example.org).\n')).toBeNull();
    expect(texteDeCellule(`${'a'.repeat(501)}\n`)).toBeNull();
    expect(corpsDuTexte('# pas un titre')).toBe('\\# pas un titre\n');
    expect(texteDeCellule(corpsDuTexte('# pas un titre'))).toBe('# pas un titre');
    expect(corpsDuTexte('  ')).toBe('');
  });
});
