import { describe, expect, it } from 'vitest';
import { MemoryLocalFs, contexteDeTest } from '../testing/memory-fs';
import { changerConfigDeBase, changerValeurDeBase, lireBase, renommerChampDeBase, renommerChoixDeBase, retirerChoixDeBase } from './database';
import { changerMode } from './page-mode';

const page = (id: string, titre: string, enPlus = '') => `---\nid: 0199a0b0-0000-7000-8000-00000000000${id}\ntitle: ${titre}\ncreated: 2026-01-01T00:00:00.000Z\nupdated: 2026-01-01T00:00:00.000Z\n${enPlus}---\n`;

function monter() {
  const fs = MemoryLocalFs.depuis({
    'Projets/page.md': page('1', 'Projets') + 'Texte de la base.\n',
    'Projets/.order': '0199a0b0-0000-7000-8000-000000000003\n0199a0b0-0000-7000-8000-000000000002\n',
    'Projets/NAS/page.md': page('2', 'NAS', 'props:\n  État: En cours\n'),
    'Projets/Site/page.md': page('3', 'Site') + 'Notes du site.\n',
  });
  return { fs, contexte: contexteDeTest(fs) };
}

describe('base de données', () => {
  it('passer en base pose la configuration par défaut ; les sous-pages sont les lignes, dans leur ordre', async () => {
    const { fs, contexte } = monter();
    await changerMode(contexte, 'Projets', 'base');
    expect(await fs.lireTexte('Projets/page.md')).toContain('mode: base\nbase:\n  fields:\n    - {name: État, type: state}\n');
    expect(await fs.lireTexte('Projets/page.md')).toContain('---\nTexte de la base.\n');
    const base = await lireBase(fs, 'Projets');
    expect(base.config).toEqual({ champs: [{ nom: 'État', type: 'etat' }], tri: null, largeurs: {}, repliees: [] });
    expect(base.lignes.map((ligne) => [ligne.titre, ligne.valeurs])).toEqual([
      ['Site', {}],
      ['NAS', { État: 'En cours' }],
    ]);
  });

  it('change une valeur dans l’en-tête de la ligne seulement, et la retire quand elle est vide', async () => {
    const { fs, contexte } = monter();
    await changerConfigDeBase(contexte, 'Projets', { champs: [{ nom: 'État', type: 'etat' }, { nom: 'Priorité', type: 'nombre' }], tri: null, largeurs: {} });
    await changerValeurDeBase(contexte, 'Projets', 'Projets/Site', 'Priorité', '2,5');
    expect(await fs.lireTexte('Projets/Site/page.md')).toMatch(/props:\n {2}Priorité: "2.5"\n---\nNotes du site\.\n$/);
    await changerValeurDeBase(contexte, 'Projets', 'Projets/Site', 'Priorité', '');
    expect(await fs.lireTexte('Projets/Site/page.md')).not.toContain('props');
    await expect(changerValeurDeBase(contexte, 'Projets', 'Projets/Site', 'Priorité', 'beaucoup')).rejects.toThrow('Un nombre');
    await expect(changerValeurDeBase(contexte, 'Projets', 'Ailleurs/Site', 'Priorité', '1')).rejects.toThrow('pas une ligne');
  });

  it('renomme un champ dans la configuration, le tri et toutes les lignes', async () => {
    const { fs, contexte } = monter();
    await changerConfigDeBase(contexte, 'Projets', { champs: [{ nom: 'État', type: 'etat' }], tri: { champ: 'État', sens: 'croissant' }, largeurs: {}, repliees: ['0199a0b0-0000-7000-8000-000000000004'] });
    await renommerChampDeBase(contexte, 'Projets', 'État', 'Avancement');
    const base = await lireBase(fs, 'Projets');
    expect(base.config).toEqual({ champs: [{ nom: 'Avancement', type: 'etat' }], tri: { champ: 'Avancement', sens: 'croissant' }, largeurs: {}, repliees: ['0199a0b0-0000-7000-8000-000000000004'] });
    expect(base.lignes.find((ligne) => ligne.titre === 'NAS')?.valeurs).toEqual({ Avancement: 'En cours' });
  });

  it('les sous-pages d’une ligne sont ses sous-lignes, modifiables et renommées comme les autres', async () => {
    const { fs, contexte } = monter();
    await fs.creerDossier('Projets/Site/Maquette');
    await fs.ecrireTexte('Projets/Site/Maquette/page.md', page('4', 'Maquette', 'props:\n  État: À faire\n'));
    await changerValeurDeBase(contexte, 'Projets', 'Projets/Site/Maquette', 'État', 'Fait');
    let base = await lireBase(fs, 'Projets');
    const site = base.lignes.find((ligne) => ligne.titre === 'Site')!;
    expect(site.enfants.map((ligne) => [ligne.titre, ligne.valeurs])).toEqual([['Maquette', { État: 'Fait' }]]);
    await renommerChampDeBase(contexte, 'Projets', 'État', 'Avancement');
    base = await lireBase(fs, 'Projets');
    expect(base.lignes.find((ligne) => ligne.titre === 'Site')!.enfants[0]!.valeurs).toEqual({ Avancement: 'Fait' });
  });

  it('refuse une configuration aux noms en double ou au tri sur un champ absent', async () => {
    const { contexte } = monter();
    await expect(changerConfigDeBase(contexte, 'Projets', { champs: [{ nom: 'A', type: 'texte' }, { nom: 'A', type: 'nombre' }], tri: null, largeurs: {} })).rejects.toThrow('Deux champs');
    await expect(changerConfigDeBase(contexte, 'Projets', { champs: [], tri: { champ: 'Z', sens: 'croissant' }, largeurs: {} })).rejects.toThrow('n\'existe pas');
    await expect(changerConfigDeBase(contexte, 'Projets', { champs: [], tri: null, largeurs: {}, repliees: ['Projets/Site'] })).rejects.toThrow('mal formée');
  });

  it('un choix tapé hors de la liste s’y ajoute ; renommé ou retiré, il suit dans toutes les lignes', async () => {
    const { fs, contexte } = monter();
    await changerConfigDeBase(contexte, 'Projets', { champs: [{ nom: 'Type', type: 'choix', choix: [{ nom: 'Code', couleur: 'success' }] }], tri: null, largeurs: {} });
    await changerValeurDeBase(contexte, 'Projets', 'Projets/Site', 'Type', 'Code');
    await changerValeurDeBase(contexte, 'Projets', 'Projets/NAS', 'Type', ' Matériel ');
    expect(await fs.lireTexte('Projets/page.md')).toContain('    - {name: Type, type: select, options: [{name: Code, color: success}, {name: Matériel}]}\n');
    await renommerChoixDeBase(contexte, 'Projets', 'Type', 'Code', 'Dev');
    let base = await lireBase(fs, 'Projets');
    expect(base.config.champs[0]?.choix).toEqual([{ nom: 'Dev', couleur: 'success' }, { nom: 'Matériel', couleur: null }]);
    expect(base.lignes.map((ligne) => ligne.valeurs['Type'])).toEqual(['Dev', 'Matériel']);
    await expect(renommerChoixDeBase(contexte, 'Projets', 'Type', 'Dev', 'Matériel')).rejects.toThrow('existe déjà');
    await retirerChoixDeBase(contexte, 'Projets', 'Type', 'Matériel');
    base = await lireBase(fs, 'Projets');
    expect(base.config.champs[0]?.choix).toEqual([{ nom: 'Dev', couleur: 'success' }]);
    expect(base.lignes.map((ligne) => ligne.valeurs)).toEqual([{ Type: 'Dev' }, { État: 'En cours' }]);
    await expect(changerValeurDeBase(contexte, 'Projets', 'Projets/Site', 'Type', 'a|b')).rejects.toThrow('sans |');
  });
});
