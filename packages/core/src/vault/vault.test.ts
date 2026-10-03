import { describe, expect, it } from 'vitest';
import { estId } from '../page/id';
import { analyserPage } from '../page/page-file';
import { MemoryLocalFs, contexteDeTest } from '../testing/memory-fs';
import { VaultError } from './context';
import { importer } from './import';
import { creerPage, deplacerPage, dupliquerPage, renommerPage, supprimerPageVide } from './operations';
import { indexerTitres } from './titles-index';
import { lireArbre, trouverNoeud } from './tree';
import type { TreeNode } from './tree';

/** Arbre réduit à ses titres, pour comparer des structures d'un coup d'œil. */
type Apercu = string | [string, Apercu[]];
const apercu = (noeuds: TreeNode[]): Apercu[] =>
  noeuds.map((noeud) => (noeud.enfants.length === 0 ? noeud.titre : [noeud.titre, apercu(noeud.enfants)]));

const page = (id: string, titre: string, corps = '') =>
  `---\nid: 0199a0b0-0000-7000-8000-${id.padStart(12, '0')}\ntitle: ${titre}\ncreated: 2026-01-01T00:00:00.000Z\nupdated: 2026-01-01T00:00:00.000Z\n---\n${corps}`;

async function vaultNeuf() {
  const fs = new MemoryLocalFs();
  const contexte = contexteDeTest(fs);
  const projets = await creerPage(contexte, { parent: '', titre: 'Projets' });
  const idees = await creerPage(contexte, { parent: '', titre: 'Idées' });
  const nas = await creerPage(contexte, { parent: projets.chemin, titre: 'Refonte du NAS' });
  const site = await creerPage(contexte, { parent: projets.chemin, titre: 'Site perso' });
  return { fs, contexte, projets, idees, nas, site };
}

describe('lireArbre', () => {
  it('lit pages, ordre manuel et éléments non importés sans rien écrire', async () => {
    const fs = MemoryLocalFs.depuis({
      '.order': '0199a0b0-0000-7000-8000-000000000002\n0199a0b0-0000-7000-8000-000000000001\n',
      'Alpha/page.md': page('1', 'Alpha'),
      'Beta/page.md': page('2', 'Bêta'),
      'Beta/Enfant/page.md': page('3', 'Enfant'),
      'Beta/assets/image.png': 'binaire',
      'Beta/page.conflit-2026-10-01.md': 'sauvegarde',
      'Gamma/page.md': page('4', 'Gamma'),
      'Zeta/page.md': '# page sans front-matter\n',
      'Dossier brut/note.md': 'texte',
      'Dossier vide/rien.txt': 'x',
      'volante.md': 'note posée là',
      'image.png': 'binaire',
      'nom refusé par SMB?.md': 'ignoré',
      '.notes/theme.toml': '',
      '.trash/Vieille/page.md': page('9', 'Vieille'),
    });
    const arbre = await lireArbre(fs);

    // Ordre manuel d'abord (Bêta, Alpha), puis le reste par titre.
    expect(apercu(arbre)).toEqual([['Bêta', ['Enfant']], 'Alpha', ['Dossier brut', ['note']], 'Gamma', 'volante', 'Zeta']);
    expect(arbre.map((noeud) => [noeud.genre, noeud.importe])).toEqual([
      ['page', true], ['page', true], ['dossier', false], ['page', true], ['fichier', false], ['page', false],
    ]);
    expect(trouverNoeud(arbre, 'Beta/Enfant')?.titre).toBe('Enfant');
    expect(trouverNoeud(arbre, 'absent')).toBeNull();
    expect(indexerTitres(arbre).get('0199a0b0-0000-7000-8000-000000000003')).toMatchObject({ chemin: 'Beta/Enfant' });
    expect(fs.ecritures).toBe(0);
  });

  it('trie les titres à la française, chiffres compris', async () => {
    const fs = MemoryLocalFs.depuis({
      'a/page.md': page('1', 'Page 10'),
      'b/page.md': page('2', 'Page 2'),
      'c/page.md': page('3', 'été'),
      'd/page.md': page('4', 'Zèbre'),
      'e/page.md': page('5', 'Abricot'),
    });
    expect(apercu(await lireArbre(fs))).toEqual(['Abricot', 'été', 'Page 2', 'Page 10', 'Zèbre']);
  });
});

describe('creerPage', () => {
  it('crée dossier, page.md et ordre, en dernière position', async () => {
    const { fs, projets, nas } = await vaultNeuf();
    expect(apercu(await lireArbre(fs))).toEqual([['Projets', ['Refonte du NAS', 'Site perso']], 'Idées']);
    expect(nas.chemin).toBe('Projets/Refonte du NAS');

    const fichier = analyserPage(fs.contenu()['Projets/Refonte du NAS/page.md']!);
    expect(fichier.meta).toMatchObject({ id: nas.id, titre: 'Refonte du NAS', creeLe: fichier.meta?.modifieLe });
    expect(estId(nas.id)).toBe(true);
    expect(fichier.corps).toBe('');
    expect(fs.contenu()['Projets/.order']).toContain(nas.id);
    expect(fs.contenu()['.order']?.startsWith(projets.id)).toBe(true);
  });

  it('insère à la position demandée et évite les collisions de nom', async () => {
    const { fs, contexte } = await vaultNeuf();
    const premier = await creerPage(contexte, { parent: '', titre: 'Tout en haut', index: 0 });
    const doublon = await creerPage(contexte, { parent: '', titre: 'idées' });
    expect(premier.chemin).toBe('Tout en haut');
    expect(doublon.chemin).toBe('idées 2');
    expect(apercu(await lireArbre(fs))).toEqual(['Tout en haut', ['Projets', ['Refonte du NAS', 'Site perso']], 'Idées', 'idées']);
  });

  it('refuse un titre vide, un parent absent ou non importé', async () => {
    const fs = MemoryLocalFs.depuis({ 'Brut/page.md': 'sans front-matter' });
    const contexte = contexteDeTest(fs);
    await expect(creerPage(contexte, { parent: '', titre: '  ' })).rejects.toMatchObject({ code: 'titre_invalide' });
    await expect(creerPage(contexte, { parent: 'Absent', titre: 'X' })).rejects.toMatchObject({ code: 'introuvable' });
    await expect(creerPage(contexte, { parent: 'Brut', titre: 'X' })).rejects.toMatchObject({ code: 'non_importee' });
    expect(fs.ecritures).toBe(0);
  });
});

describe('renommerPage', () => {
  it('change le titre, la date de modification et le nom du dossier, sans toucher au corps ni aux enfants', async () => {
    const { fs, contexte, projets, nas } = await vaultNeuf();
    await fs.ecrireTexte('Projets/page.md', fs.contenu()['Projets/page.md'] + '# Corps\n\nintact\n');
    const avant = analyserPage(fs.contenu()['Projets/page.md']!);

    const resultat = await renommerPage(contexte, projets.chemin, 'Projets 2026 : perso');
    expect(resultat).toEqual({ chemin: 'Projets 2026 - perso', id: projets.id });

    const apres = analyserPage(fs.contenu()['Projets 2026 - perso/page.md']!);
    expect(apres.meta).toMatchObject({ id: projets.id, titre: 'Projets 2026 : perso', creeLe: avant.meta?.creeLe });
    expect(apres.meta?.modifieLe).not.toBe(avant.meta?.modifieLe);
    expect(apres.corps).toBe('# Corps\n\nintact\n');
    expect(trouverNoeud(await lireArbre(fs), 'Projets 2026 - perso/Refonte du NAS')?.id).toBe(nas.id);
    expect(fs.contenu()['Projets/page.md']).toBeUndefined();
  });

  it('ne fait rien si le titre est inchangé, et garde le dossier si seul le titre diffère', async () => {
    const { fs, contexte, idees } = await vaultNeuf();
    const ecritures = fs.ecritures;
    await renommerPage(contexte, idees.chemin, 'Idées');
    expect(fs.ecritures).toBe(ecritures);
    // « Idées? » s'assainit en « Idées- » : le dossier change. « Idées » avec espaces autour : non.
    expect((await renommerPage(contexte, idees.chemin, '  Idées  ')).chemin).toBe('Idées');
  });

  it('numérote si le nom de dossier voulu est déjà pris', async () => {
    const { contexte, idees } = await vaultNeuf();
    expect((await renommerPage(contexte, idees.chemin, 'Projets')).chemin).toBe('Projets 2');
  });
});

describe('deplacerPage', () => {
  it('réordonne dans le même parent', async () => {
    const { fs, contexte, site, idees } = await vaultNeuf();
    await deplacerPage(contexte, site.chemin, { parent: 'Projets', index: 0 });
    await deplacerPage(contexte, idees.chemin, { parent: '', index: 0 });
    expect(apercu(await lireArbre(fs))).toEqual(['Idées', ['Projets', ['Site perso', 'Refonte du NAS']]]);
  });

  it('déplace sous un autre parent avec sa descendance et met à jour les deux ordres', async () => {
    const { fs, contexte, projets, idees, nas } = await vaultNeuf();
    const resultat = await deplacerPage(contexte, projets.chemin, { parent: idees.chemin });
    expect(resultat.chemin).toBe('Idées/Projets');
    expect(apercu(await lireArbre(fs))).toEqual([['Idées', [['Projets', ['Refonte du NAS', 'Site perso']]]]]);
    expect(fs.contenu()['.order']).toBe(`${idees.id}\n`);
    expect(fs.contenu()['Idées/.order']).toBe(`${projets.id}\n`);

    // Retour à la racine, entre deux pages : le `.order` vidé disparaît.
    await deplacerPage(contexte, 'Idées/Projets/Refonte du NAS', { parent: '', index: 0 });
    expect(apercu(await lireArbre(fs))).toEqual(['Refonte du NAS', ['Idées', [['Projets', ['Site perso']]]]]);
    expect(trouverNoeud(await lireArbre(fs), 'Refonte du NAS')?.id).toBe(nas.id);
  });

  it('renomme le dossier si le nom est pris dans le parent cible', async () => {
    const { contexte, projets, idees } = await vaultNeuf();
    const homonyme = await creerPage(contexte, { parent: projets.chemin, titre: 'Idées' });
    expect((await deplacerPage(contexte, homonyme.chemin, { parent: '' })).chemin).toBe('Idées 2');
    expect(idees.chemin).toBe('Idées');
  });

  it('refuse de déplacer une page dans elle-même ou sa descendance, sans rien écrire', async () => {
    const { fs, contexte, projets, nas } = await vaultNeuf();
    const ecritures = fs.ecritures;
    for (const parent of [projets.chemin, nas.chemin]) {
      await expect(deplacerPage(contexte, projets.chemin, { parent })).rejects.toBeInstanceOf(VaultError);
    }
    await expect(deplacerPage(contexte, 'Absente', { parent: '' })).rejects.toMatchObject({ code: 'introuvable' });
    expect(fs.ecritures).toBe(ecritures);
  });
});

describe('supprimerPageVide', () => {
  it('retire le dossier et la ligne de l’ordre du parent', async () => {
    const { fs, contexte, projets, site } = await vaultNeuf();
    const vide = await creerPage(contexte, { parent: projets.chemin, titre: 'Sans titre', index: 1 });
    const resultat = await supprimerPageVide(contexte, vide.chemin);
    expect(resultat).toEqual({ chemin: 'Projets', id: vide.id });
    expect(fs.contenu()['Projets/Sans titre/page.md']).toBeUndefined();
    expect(fs.contenu()['Projets/.order']).not.toContain(vide.id);
    expect(fs.contenu()['Projets/.order']).toContain(site.id);
    expect(apercu(await lireArbre(fs))).toEqual([['Projets', ['Refonte du NAS', 'Site perso']], 'Idées']);
  });

  it('refuse une page qui a un contenu, une sous-page ou un autre fichier, sans rien écrire', async () => {
    const fs = MemoryLocalFs.depuis({
      'Texte/page.md': page('1', 'Sans titre', 'Une phrase.\n'),
      'Parent/page.md': page('2', 'Sans titre'),
      'Parent/Enfant/page.md': page('3', 'Enfant'),
      'Image/page.md': page('4', 'Sans titre'),
      'Image/assets/photo.png': 'binaire',
      'Brut/page.md': 'sans front-matter',
    });
    const contexte = contexteDeTest(fs);
    for (const chemin of ['Texte', 'Parent', 'Image']) {
      await expect(supprimerPageVide(contexte, chemin)).rejects.toMatchObject({ code: 'page_non_vide' });
    }
    await expect(supprimerPageVide(contexte, 'Brut')).rejects.toMatchObject({ code: 'non_importee' });
    await expect(supprimerPageVide(contexte, '')).rejects.toMatchObject({ code: 'introuvable' });
    expect(fs.ecritures).toBe(0);
  });

  it('accepte un corps fait seulement de lignes vides', async () => {
    const fs = MemoryLocalFs.depuis({ 'Vide/page.md': page('1', 'Sans titre', '\n\n') });
    await supprimerPageVide(contexteDeTest(fs), 'Vide');
    expect(Object.keys(fs.contenu())).toEqual([]);
  });
});

describe('dupliquerPage', () => {
  it('copie la page et sa descendance avec de nouveaux identifiants, juste après l’original', async () => {
    const { fs, contexte, projets, nas, site } = await vaultNeuf();
    await fs.creerDossier('Projets/assets');
    await fs.ecrireTexte('Projets/assets/schema.png', 'binaire');
    await deplacerPage(contexte, site.chemin, { parent: 'Projets', index: 0 });

    const copie = await dupliquerPage(contexte, projets.chemin);
    expect(copie.chemin).toBe('Projets (copie)');
    const arbre = await lireArbre(fs);
    expect(apercu(arbre)).toEqual([
      ['Projets', ['Site perso', 'Refonte du NAS']],
      ['Projets (copie)', ['Site perso', 'Refonte du NAS']],
      'Idées',
    ]);
    expect(fs.contenu()['Projets (copie)/assets/schema.png']).toBe('binaire');

    const ids = [...indexerTitres(arbre).keys()];
    expect(new Set(ids).size).toBe(7);
    expect(trouverNoeud(arbre, 'Projets (copie)/Refonte du NAS')?.id).not.toBe(nas.id);
    // L'original n'a pas bougé.
    expect(trouverNoeud(arbre, 'Projets')?.id).toBe(projets.id);
  });
});

describe('importer', () => {
  it('transforme un fichier .md en page sans modifier son contenu', async () => {
    const fs = MemoryLocalFs.depuis({ 'Recette de pâtes.md': '# Pâtes\n\n- eau\n- sel\n', 'Recette de pâtes/autre.txt': 'x' });
    const resultat = await importer(contexteDeTest(fs), 'Recette de pâtes.md');
    // Un dossier du même nom existe déjà : la page prend le nom libre suivant.
    expect(resultat.chemin).toBe('Recette de pâtes 2');
    expect(Object.keys(fs.contenu())).toEqual(['Recette de pâtes 2/page.md', 'Recette de pâtes/autre.txt']);
    const fichier = analyserPage(fs.contenu()['Recette de pâtes 2/page.md']!);
    expect(fichier.meta).toMatchObject({ id: resultat.id, titre: 'Recette de pâtes' });
    expect(fichier.corps).toBe('# Pâtes\n\n- eau\n- sel\n');
  });

  it('complète un front-matter existant en gardant son titre, sa date et ses clés', async () => {
    const fs = MemoryLocalFs.depuis({
      'Venue/page.md': '---\ntitle: Titre d’origine\ncreated: 2024-05-01\ntags: [a]\n---\ncorps\n',
    });
    const resultat = await importer(contexteDeTest(fs), 'Venue');
    const texte = fs.contenu()['Venue/page.md']!;
    expect(analyserPage(texte).meta).toMatchObject({ id: resultat.id, titre: 'Titre d’origine', creeLe: '2024-05-01' });
    expect(texte).toContain('tags: [a]');
    expect(texte.endsWith('---\ncorps\n')).toBe(true);
  });

  it('crée une page vide pour un dossier sans page.md, puis permet d’importer son contenu', async () => {
    const fs = MemoryLocalFs.depuis({ 'Vrac/note.md': 'texte' });
    const contexte = contexteDeTest(fs);
    await expect(importer(contexte, 'Vrac/note.md')).rejects.toMatchObject({ code: 'non_importee' });
    await importer(contexte, 'Vrac');
    await importer(contexte, 'Vrac/note.md');
    const arbre = await lireArbre(fs);
    expect(apercu(arbre)).toEqual([['Vrac', ['note']]]);
    expect(arbre[0]?.importe && arbre[0].enfants[0]?.importe).toBe(true);
  });

  it('refuse une page déjà importée, un chemin absent ou un fichier qui n’est pas une note', async () => {
    const fs = MemoryLocalFs.depuis({ 'A/page.md': page('1', 'A'), 'image.png': 'x', '.notes/x.md': 'x' });
    const contexte = contexteDeTest(fs);
    await expect(importer(contexte, 'A')).rejects.toMatchObject({ code: 'deja_importee' });
    for (const chemin of ['absent.md', 'image.png', '.notes/x.md', '']) {
      await expect(importer(contexte, chemin)).rejects.toMatchObject({ code: 'introuvable' });
    }
    expect(fs.ecritures).toBe(0);
  });
});

describe('persistance', () => {
  // Critère de sortie de J1 : l'arbre se retrouve à l'identique en relisant le disque.
  it('retrouve la même arborescence à partir du seul contenu du disque', async () => {
    const { fs, contexte, projets, idees, site } = await vaultNeuf();
    await deplacerPage(contexte, site.chemin, { parent: idees.chemin });
    await renommerPage(contexte, projets.chemin, 'Chantiers');
    await dupliquerPage(contexte, 'Idées');
    const avant = await lireArbre(fs);

    const relu = await lireArbre(MemoryLocalFs.depuis(fs.contenu()));
    expect(relu).toEqual(avant);
    expect(apercu(relu)).toEqual([['Chantiers', ['Refonte du NAS']], ['Idées', ['Site perso']], ['Idées (copie)', ['Site perso']]]);
  });
});
