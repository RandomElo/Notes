import { Transform } from '@tiptap/pm/transform';
import { describe, expect, it } from 'vitest';
import { lireMarkdown } from '../markdown/parse';
import { ecrireMarkdown } from '../markdown/serialize';
import { aplatirLignes, remplacerTableauDeBase, sansTableauDeBase, tableauDeBase, trierLignes } from './database-table';
import type { DatabaseColumn } from './database-table';

const colonnes: DatabaseColumn[] = [
  { nom: 'État', type: 'etat' },
  { nom: 'Fait', type: 'case' },
  { nom: 'Priorité', type: 'nombre' },
];
const ligne = (id: string, titre: string, valeurs: Record<string, string>) => ({ id: `0199a0b0-0000-7000-8000-00000000000${id}`, titre, valeurs });
const lignes = [ligne('1', 'Site', { État: 'Fait', Priorité: '10' }), ligne('2', 'NAS', { État: 'En cours', Fait: 'true', Priorité: '2.5' }), ligne('3', 'Vélo', {})];
const etats = ['À faire', 'En cours', 'Fait'];

describe('tri des lignes', () => {
  it('suit le type du champ, les valeurs vides toujours à la fin', () => {
    const titres = (tri: Parameters<typeof trierLignes>[2]) => trierLignes(lignes, colonnes, tri, etats).map((rangee) => rangee.titre);
    expect(titres(null)).toEqual(['Site', 'NAS', 'Vélo']);
    expect(titres({ champ: 'Priorité', sens: 'croissant' })).toEqual(['NAS', 'Site', 'Vélo']);
    expect(titres({ champ: 'Priorité', sens: 'decroissant' })).toEqual(['Site', 'NAS', 'Vélo']);
    expect(titres({ champ: 'État', sens: 'croissant' })).toEqual(['NAS', 'Site', 'Vélo']);
    expect(titres({ champ: 'Fait', sens: 'croissant' })).toEqual(['NAS', 'Site', 'Vélo']);
    expect(titres({ champ: 'Page', sens: 'croissant' })).toEqual(['NAS', 'Site', 'Vélo']);
  });

  it('range un choix dans l’ordre de sa liste, une valeur hors liste après', () => {
    const type: DatabaseColumn[] = [{ nom: 'Type', type: 'choix', choix: [{ nom: 'Code' }, { nom: 'Autre' }] }];
    const rangees = [ligne('1', 'A', { Type: 'Autre' }), ligne('2', 'B', { Type: 'Ailleurs' }), ligne('3', 'C', { Type: 'Code' }), ligne('4', 'D', {})];
    expect(trierLignes(rangees, type, { champ: 'Type', sens: 'croissant' }, etats).map((rangee) => rangee.titre)).toEqual(['C', 'A', 'B', 'D']);
  });
});

describe('tableau de la base', () => {
  it('s’écrit en Markdown ordinaire, titres en mentions, case en ✓, nombre à la française', () => {
    const markdown = tableauDeBase(colonnes, [ligne('2', 'NAS | maison', { État: 'En cours', Fait: 'true', Priorité: '2.5' })]);
    expect(markdown).toBe('| Page | État | Fait | Priorité |\n| --- | --- | --- | --- |\n| [NAS \\| maison](notes://0199a0b0-0000-7000-8000-000000000002) | En cours | ✓ | 2,5 |');
    const lu = lireMarkdown(`${markdown}\n`).document;
    expect(lu.firstChild?.type.name).toBe('table');
    const mention = lu.firstChild?.child(1).firstChild?.firstChild?.firstChild;
    expect([mention?.type.name, mention?.attrs['libelle']]).toEqual(['pageMention', 'NAS | maison']);
  });

  it('remplace celui de la page sans toucher au texte autour, ou s’ajoute à la fin', () => {
    const corps = 'Texte avant.\n\n| Page | État |\n| --- | --- |\n| [Vieux](notes://0199a0b0-0000-7000-8000-000000000001) | Fait |\n\nTexte après.\n';
    const { document, source } = lireMarkdown(corps);
    const tr = new Transform(document);
    expect(remplacerTableauDeBase(tr, tableauDeBase([{ nom: 'État', type: 'etat' }], [ligne('1', 'Neuf', { État: 'À faire' })]))).toBe(true);
    const ecrit = ecrireMarkdown(tr.doc, source);
    expect(ecrit).toContain('Texte avant.\n\n| Page');
    expect(ecrit).toContain('Neuf');
    expect(ecrit).not.toContain('Vieux');
    expect(ecrit.endsWith('\n\nTexte après.\n')).toBe(true);
    // Rien à changer : rien ne change.
    expect(remplacerTableauDeBase(tr, tableauDeBase([{ nom: 'État', type: 'etat' }], [ligne('1', 'Neuf', { État: 'À faire' })]))).toBe(false);

    const sans = new Transform(lireMarkdown('Une base.\n').document);
    remplacerTableauDeBase(sans, tableauDeBase([], []));
    expect(ecrireMarkdown(sans.doc)).toBe('Une base.\n\n| Page |\n| ---- |\n');
  });
});

describe('lecture seule', () => {
  it('retire le tableau écrit sans toucher au reste', () => {
    expect(sansTableauDeBase('Avant.\n\n| Page |\n| --- |\n\nAprès *ici*.\n')).toBe('Avant.\n\nAprès *ici*.\n');
    expect(sansTableauDeBase('Rien à retirer.\n')).toBe('Rien à retirer.\n');
  });
});

describe('sous-lignes', () => {
  it('se placent sous leur ligne, triées à leur niveau, marquées ↳ dans le tableau écrit', () => {
    const avecEnfants = [
      { ...ligne('1', 'Site', { Priorité: '1' }), enfants: [ligne('4', 'Logo', { Priorité: '9' }), ligne('5', 'Menu', { Priorité: '3' })] },
      ligne('2', 'NAS', { Priorité: '5' }),
    ];
    const aPlat = aplatirLignes(avecEnfants, colonnes, { champ: 'Priorité', sens: 'decroissant' }, etats);
    expect(aPlat.map(({ ligne: rangee, profondeur }) => [rangee.titre, profondeur])).toEqual([['NAS', 0], ['Site', 0], ['Logo', 1], ['Menu', 1]]);
    const markdown = tableauDeBase([], aPlat.map(({ ligne: rangee, profondeur }) => ({ ...rangee, profondeur })));
    expect(markdown).toContain('| ↳ [Logo](notes://0199a0b0-0000-7000-8000-000000000004) |');
  });
});
