import { describe, expect, it } from 'vitest';
import { MemoryIndexStore, MemoryLocalFs, contexteDeTest } from '../testing/memory-fs';
import { MemoryRemoteFs } from '../testing/memory-remote-fs';
import { synchroniser } from '../sync/engine';
import { VaultError } from '../vault/context';
import { creerPage, deplacerPage, deplacerPages } from '../vault/operations';
import { lireArbre } from '../vault/tree';
import type { TreeNode } from '../vault/tree';
import {
  listerCorbeille,
  lireApercu,
  mettreALaCorbeille,
  mettreImageALaCorbeille,
  placeDOrigine,
  purgerCorbeille,
  rapatrierEntree,
  restaurerEntree,
  retentionCorbeilleMs,
  stockageDistant,
  stockageLocal,
  supprimerEntree,
  transfererCorbeille,
  viderCorbeille,
} from './trash';

const titres = (noeuds: TreeNode[]): unknown[] => noeuds.map((noeud) => (noeud.enfants.length === 0 ? noeud.titre : [noeud.titre, titres(noeud.enfants)]));

/** Projets (Refonte (Étape 1, avec une image), Site), Idées. */
async function vaultNeuf() {
  const fs = new MemoryLocalFs();
  const contexte = contexteDeTest(fs);
  const projets = await creerPage(contexte, { parent: '', titre: 'Projets' });
  const idees = await creerPage(contexte, { parent: '', titre: 'Idées' });
  const refonte = await creerPage(contexte, { parent: projets.chemin, titre: 'Refonte' });
  const site = await creerPage(contexte, { parent: projets.chemin, titre: 'Site' });
  const etape = await creerPage(contexte, { parent: refonte.chemin, titre: 'Étape 1' });
  await fs.creerDossier(`${etape.chemin}/assets`);
  await fs.ecrireOctets(`${etape.chemin}/assets/schema.png`, Uint8Array.from([1, 2, 3]));
  await fs.ecrireTexte(`${etape.chemin}/page.md`, `${await fs.lireTexte(`${etape.chemin}/page.md`)}Texte ![](assets/schema.png)\n`);
  return { fs, contexte, projets, idees, refonte, site, etape };
}

describe('mettreALaCorbeille', () => {
  it('range la page et sa descendance dans .trash/ avec sa description, hors de l’arborescence', async () => {
    const { fs, contexte, projets, refonte } = await vaultNeuf();
    const avant = fs.contenu();
    const resultat = await mettreALaCorbeille(contexte, refonte.chemin);

    expect(resultat).toEqual({ chemin: projets.chemin, id: refonte.id });
    expect(titres(await lireArbre(fs))).toEqual([['Projets', ['Site']], 'Idées']);
    expect(await fs.lireTexte(`${projets.chemin}/.order`)).not.toContain(refonte.id);

    const [entree, ...autres] = await listerCorbeille(stockageLocal(fs));
    expect(autres).toEqual([]);
    expect(entree).toMatchObject({ nature: 'page', nom: 'Refonte', titre: 'Refonte', cheminOrigine: 'Projets/Refonte', id: refonte.id, parentId: projets.id });
    expect(entree?.entree).toMatch(/^2026-10-01T12-00-\d{2}-000Z Refonte$/);
    // Tous les fichiers de la page sont dans l'entrée, octet pour octet.
    const apres = fs.contenu();
    for (const [chemin, contenu] of Object.entries(avant).filter(([chemin]) => chemin.startsWith('Projets/Refonte/'))) {
      expect(apres[`.trash/${entree?.entree}/${chemin.slice('Projets/'.length)}`]).toBe(contenu);
    }
  });

  it('donne deux entrées distinctes à deux pages du même nom supprimées au même instant', async () => {
    const fs = new MemoryLocalFs();
    const contexte = { ...contexteDeTest(fs), maintenant: () => Date.UTC(2026, 9, 1) };
    const a = await creerPage(contexte, { parent: '', titre: 'Note' });
    const parent = await creerPage(contexte, { parent: '', titre: 'Dossier' });
    const b = await creerPage(contexte, { parent: parent.chemin, titre: 'Note' });
    await mettreALaCorbeille(contexte, a.chemin);
    await mettreALaCorbeille(contexte, b.chemin);
    const entrees = await listerCorbeille(stockageLocal(fs));
    expect(entrees.map((entree) => entree.entree).sort()).toEqual(['2026-10-01T00-00-00-000Z Note', '2026-10-01T00-00-00-000Z Note 2']);
  });

  it('ignore une entrée incomplète (description sans la page) dans la liste', async () => {
    const fs = MemoryLocalFs.depuis({
      '.trash/2026-10-01T00-00-00-000Z X/.trashmeta.yaml': 'kind: page\nname: X\npath: X\ndeleted: 2026-10-01T00:00:00.000Z\n',
      '.trash/vrac.txt': 'x',
    });
    expect(await listerCorbeille(stockageLocal(fs))).toEqual([]);
  });
});

describe('restaurerEntree', () => {
  it('remet la page intégralement à sa place, sous son parent même déplacé', async () => {
    const { fs, contexte, projets, idees, refonte } = await vaultNeuf();
    const avant = fs.contenu();
    await mettreALaCorbeille(contexte, refonte.chemin);
    // Le parent a changé de place entre-temps : la page le suit.
    const deplace = await deplacerPage(contexte, projets.chemin, { parent: idees.chemin });
    const [entree] = await listerCorbeille(stockageLocal(fs));

    const restauree = await restaurerEntree(contexte, entree?.entree ?? '');
    expect(restauree).toEqual({ chemin: `${deplace.chemin}/Refonte`, id: refonte.id });
    expect(titres(await lireArbre(fs))).toEqual([['Idées', [['Projets', [['Refonte', ['Étape 1']], 'Site']]]]]);
    const apres = fs.contenu();
    for (const [chemin, contenu] of Object.entries(avant).filter(([chemin]) => chemin.startsWith('Projets/Refonte/'))) {
      expect(apres[`Idées/${chemin}`]).toBe(contenu);
    }
    expect(await listerCorbeille(stockageLocal(fs))).toEqual([]);
    expect(Object.keys(apres).some((chemin) => chemin.startsWith('.trash/'))).toBe(false);
  });

  it('remet la page à sa place parmi ses sœurs, deux voisines dans leur ordre quel que soit l’ordre des restaurations', async () => {
    for (const ordreDesRestaurations of [['B', 'C'], ['C', 'B']]) {
      const fs = new MemoryLocalFs();
      const contexte = contexteDeTest(fs);
      const pages = new Map<string, string>();
      for (const titre of ['A', 'B', 'C', 'D']) {
        pages.set(titre, (await creerPage(contexte, { parent: '', titre })).chemin);
      }
      await mettreALaCorbeille(contexte, pages.get('B') ?? '');
      await mettreALaCorbeille(contexte, pages.get('C') ?? '');
      expect(titres(await lireArbre(fs))).toEqual(['A', 'D']);
      for (const titre of ordreDesRestaurations) {
        const entree = (await listerCorbeille(stockageLocal(fs))).find((candidate) => candidate.titre === titre);
        await restaurerEntree(contexte, entree?.entree ?? '');
      }
      expect(titres(await lireArbre(fs))).toEqual(['A', 'B', 'C', 'D']);
    }
  });

  it('retrouve la place d’origine par la sœur suivante, la précédente, puis le rang', () => {
    expect(placeDOrigine(['a', 'b', 'c'], { suivantId: 'c', precedentId: 'a', rang: 0 })).toBe(2);
    expect(placeDOrigine(['a', 'b', 'c'], { suivantId: 'x', precedentId: 'a', rang: 0 })).toBe(1);
    expect(placeDOrigine(['a', 'b', 'c'], { suivantId: 'x', precedentId: 'y', rang: 1 })).toBe(1);
    expect(placeDOrigine(['a'], { suivantId: null, precedentId: null, rang: 5 })).toBe(1);
    expect(placeDOrigine(['a', 'b'], { suivantId: null, precedentId: null, rang: null })).toBe(2);
  });

  it('remet la page à la racine si son parent n’existe plus, sous un autre nom si le sien est pris', async () => {
    const { fs, contexte, projets, refonte } = await vaultNeuf();
    await mettreALaCorbeille(contexte, refonte.chemin);
    await mettreALaCorbeille(contexte, projets.chemin);
    await creerPage(contexte, { parent: '', titre: 'Refonte' });
    const entree = (await listerCorbeille(stockageLocal(fs))).find((candidate) => candidate.titre === 'Refonte');

    const restauree = await restaurerEntree(contexte, entree?.entree ?? '');
    expect(restauree.chemin).toBe('Refonte 2');
    expect(titres(await lireArbre(fs))).toEqual(['Idées', 'Refonte', ['Refonte', ['Étape 1']]]);
  });

  it('refuse une page dont l’identifiant est déjà dans le dossier des notes, et la laisse dans la corbeille', async () => {
    const { fs, contexte, refonte } = await vaultNeuf();
    await mettreALaCorbeille(contexte, refonte.chemin);
    const [entree] = await listerCorbeille(stockageLocal(fs));
    // La sync l'a fait revenir (modifiée sur l'autre appareil) : même identifiant.
    await fs.creerDossier('Revenue');
    await fs.ecrireTexte('Revenue/page.md', await fs.lireTexte(`.trash/${entree?.entree}/Refonte/page.md`));

    await expect(restaurerEntree(contexte, entree?.entree ?? '')).rejects.toThrow(VaultError);
    expect(await listerCorbeille(stockageLocal(fs))).toHaveLength(1);
  });

  it('remet une image dans le dossier assets/ de sa page', async () => {
    const { fs, contexte, etape } = await vaultNeuf();
    await mettreImageALaCorbeille(contexte, `${etape.chemin}/assets/schema.png`);
    expect(await fs.infos(`${etape.chemin}/assets/schema.png`)).toBeNull();
    const [entree] = await listerCorbeille(stockageLocal(fs));
    expect(entree).toMatchObject({ nature: 'image', nom: 'schema.png', parentId: etape.id, id: null });

    const apercu = await lireApercu(stockageLocal(fs), entree?.entree ?? '');
    expect(apercu).toEqual({ nature: 'image', titre: 'schema.png', octets: Uint8Array.from([1, 2, 3]) });

    // Un autre fichier a pris son nom : elle revient à côté.
    await fs.ecrireOctets(`${etape.chemin}/assets/schema.png`, Uint8Array.from([9]));
    const restauree = await restaurerEntree(contexte, entree?.entree ?? '');
    expect(restauree.chemin).toBe(`${etape.chemin}/assets/schema 2.png`);
    expect(await fs.lireOctets(restauree.chemin)).toEqual(Uint8Array.from([1, 2, 3]));
  });

  it('refuse une image dont la page n’existe plus', async () => {
    const { fs, contexte, etape, refonte } = await vaultNeuf();
    await mettreImageALaCorbeille(contexte, `${etape.chemin}/assets/schema.png`);
    await mettreALaCorbeille(contexte, refonte.chemin);
    const image = (await listerCorbeille(stockageLocal(fs))).find((entree) => entree.nature === 'image');
    await expect(restaurerEntree(contexte, image?.entree ?? '')).rejects.toThrow('La page de cette image');
  });

  it('refuse ce qui n’est pas une image d’un dossier assets/', async () => {
    const { contexte, etape } = await vaultNeuf();
    await expect(mettreImageALaCorbeille(contexte, `${etape.chemin}/page.md`)).rejects.toThrow(VaultError);
  });
});

describe('aperçu, suppression, purge', () => {
  it('montre le texte de la page et ses sous-pages', async () => {
    const { fs, contexte, projets } = await vaultNeuf();
    await mettreALaCorbeille(contexte, projets.chemin);
    const [entree] = await listerCorbeille(stockageLocal(fs));
    const apercu = await lireApercu(stockageLocal(fs), entree?.entree ?? '');
    expect(apercu).toEqual({ nature: 'page', titre: 'Projets', corps: '', sousPages: ['Refonte', '  Étape 1', 'Site'] });
  });

  it('supprime une entrée, vide la corbeille, refuse un nom qui sort de la corbeille', async () => {
    const { fs, contexte, refonte, idees } = await vaultNeuf();
    await mettreALaCorbeille(contexte, refonte.chemin);
    await mettreALaCorbeille(contexte, idees.chemin);
    const [premiere] = await listerCorbeille(stockageLocal(fs));
    await supprimerEntree(stockageLocal(fs), premiere?.entree ?? '');
    expect(await listerCorbeille(stockageLocal(fs))).toHaveLength(1);
    await expect(supprimerEntree(stockageLocal(fs), '../Projets')).rejects.toThrow(VaultError);
    await viderCorbeille(stockageLocal(fs));
    expect(Object.keys(fs.contenu()).filter((chemin) => chemin.startsWith('.trash/'))).toEqual([]);
    expect(titres(await lireArbre(fs))).toEqual([['Projets', ['Site']]]);
  });

  it('purge ce qui a plus de 30 jours, y compris une entrée à la description illisible', async () => {
    const debut = Date.UTC(2026, 9, 1);
    const { fs, contexte, refonte, idees } = await vaultNeuf();
    await mettreALaCorbeille({ ...contexte, maintenant: () => debut }, refonte.chemin);
    await mettreALaCorbeille({ ...contexte, maintenant: () => debut + 20 * 24 * 3600 * 1000 }, idees.chemin);
    await fs.creerDossier('.trash/2026-09-01T00-00-00-000Z Cassée');
    await fs.ecrireTexte('.trash/2026-09-01T00-00-00-000Z Cassée/.trashmeta.yaml', ': pas du yaml [');

    expect(await purgerCorbeille(stockageLocal(fs), debut + retentionCorbeilleMs - 1)).toBe(1);
    expect((await listerCorbeille(stockageLocal(fs))).map((entree) => entree.titre)).toEqual(['Idées', 'Refonte']);
    expect(await purgerCorbeille(stockageLocal(fs), debut + retentionCorbeilleMs + 1)).toBe(1);
    expect((await listerCorbeille(stockageLocal(fs))).map((entree) => entree.titre)).toEqual(['Idées']);
  });
});

describe('corbeille et NAS', () => {
  it('une page supprimée part du NAS et arrive dans sa corbeille, puis quitte le poste ; restaurée, elle revient partout', async () => {
    const { fs, contexte, refonte } = await vaultNeuf();
    const nas = new MemoryRemoteFs();
    const index = new MemoryIndexStore();
    const cycle = async () => {
      await synchroniser({ local: fs, distant: nas, index, cle: 'vault', maintenant: () => Date.UTC(2026, 9, 2), appareil: 'a' });
      await transfererCorbeille(fs, nas);
    };
    await cycle();
    const pageSurLeNas = nas.contenu()['Projets/Refonte/Étape 1/page.md'];
    expect(pageSurLeNas).toBeDefined();

    await mettreALaCorbeille(contexte, refonte.chemin);
    await cycle();
    const contenu = nas.contenu();
    expect(Object.keys(contenu).filter((chemin) => chemin.startsWith('Projets/Refonte'))).toEqual([]);
    const [entree] = await listerCorbeille(stockageDistant(nas));
    expect(entree?.titre).toBe('Refonte');
    expect(contenu[`.trash/${entree?.entree}/Refonte/Étape 1/page.md`]).toBe(pageSurLeNas);
    expect(contenu[`.trash/${entree?.entree}/Refonte/Étape 1/assets/schema.png`]).toBeDefined();
    expect(Object.keys(fs.contenu()).filter((chemin) => chemin.startsWith('.trash/'))).toEqual([]);

    // Restauration depuis le NAS : rapatriée, remise en place, renvoyée par la sync.
    await rapatrierEntree(fs, nas, entree?.entree ?? '');
    expect(await listerCorbeille(stockageDistant(nas))).toEqual([]);
    await restaurerEntree(contexte, entree?.entree ?? '');
    await cycle();
    expect(nas.contenu()['Projets/Refonte/Étape 1/page.md']).toBe(pageSurLeNas);
    expect(Object.keys(nas.contenu()).filter((chemin) => chemin.startsWith('.trash/'))).toEqual([]);
  });

  it('NAS injoignable : l’entrée reste sur le poste et part au cycle suivant', async () => {
    const { fs, contexte, idees } = await vaultNeuf();
    const nas = new MemoryRemoteFs();
    await mettreALaCorbeille(contexte, idees.chemin);
    nas.panne = true;
    await expect(transfererCorbeille(fs, nas)).rejects.toThrow();
    expect(await listerCorbeille(stockageLocal(fs))).toHaveLength(1);
    nas.panne = false;
    expect(await transfererCorbeille(fs, nas)).toBe(1);
    expect(await listerCorbeille(stockageLocal(fs))).toEqual([]);
    expect(await listerCorbeille(stockageDistant(nas))).toHaveLength(1);
  });

  it('une entrée coupée en route sur le NAS (sans description) n’y est pas listée et se réécrit', async () => {
    const { fs, contexte, idees } = await vaultNeuf();
    const nas = new MemoryRemoteFs();
    await mettreALaCorbeille(contexte, idees.chemin);
    nas.echouerSur = (operation, chemin) => operation === 'ecrire' && chemin.endsWith('.trashmeta.yaml');
    await expect(transfererCorbeille(fs, nas)).rejects.toThrow();
    expect(await listerCorbeille(stockageDistant(nas))).toEqual([]);
    nas.echouerSur = null;
    await transfererCorbeille(fs, nas);
    expect(await listerCorbeille(stockageDistant(nas))).toHaveLength(1);
  });
});

describe('deplacerPages', () => {
  it('déplace plusieurs pages ensemble, dans l’ordre, à la position voulue', async () => {
    const { fs, contexte, projets, idees, refonte, site } = await vaultNeuf();
    const autre = await creerPage(contexte, { parent: idees.chemin, titre: 'Autre' });
    await deplacerPages(contexte, [site.chemin, refonte.chemin], { parent: idees.chemin, index: 0 });
    expect(titres(await lireArbre(fs))).toEqual(['Projets', ['Idées', ['Site', ['Refonte', ['Étape 1']], 'Autre']]]);
    expect(autre.chemin).toBe('Idées/Autre');
    expect(projets.chemin).toBe('Projets');
  });

  it('une sous-page sélectionnée avec son parent suit celui-ci', async () => {
    const { fs, contexte, idees, refonte, etape } = await vaultNeuf();
    await deplacerPages(contexte, [refonte.chemin, etape.chemin], { parent: idees.chemin });
    expect(titres(await lireArbre(fs))).toEqual([['Projets', ['Site']], ['Idées', [['Refonte', ['Étape 1']]]]]);
  });

  it('refuse de déplacer une page dans une des pages déplacées', async () => {
    const { contexte, projets, idees, refonte } = await vaultNeuf();
    await expect(deplacerPages(contexte, [idees.chemin, projets.chemin], { parent: refonte.chemin })).rejects.toThrow(VaultError);
  });

  it('réordonne des pages sœurs sans changer de parent', async () => {
    const { fs, contexte, projets, idees } = await vaultNeuf();
    const trois = await creerPage(contexte, { parent: '', titre: 'Trois' });
    await deplacerPages(contexte, [idees.chemin, trois.chemin], { parent: '', index: 0 });
    expect(titres(await lireArbre(fs)).map((titre) => (Array.isArray(titre) ? titre[0] : titre))).toEqual(['Idées', 'Trois', 'Projets']);
    expect(projets.id).toBeDefined();
  });
});
