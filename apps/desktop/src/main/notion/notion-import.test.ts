import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lireArbre } from '@notes/core';
import type { TreeNode } from '@notes/core';
import { describe, expect, it, vi } from 'vitest';
import { SettingsStore } from '../settings/settings-store';
import { creerFileDAttente } from '../vault/serial-queue';
import { VaultService } from '../vault/vault-service';
import { creerHandlersVault } from '../ipc/vault';
import { analyserExport, apercuDePage, cheminDansLExport, idDeNotion, importerExport, titreAccepte } from './notion-import';

const a = 'a'.repeat(32);
const b = 'b'.repeat(32);
const c = 'c'.repeat(32);
const d = 'd'.repeat(32);

const page = (titre: string, corps: string, entete = ''): string =>
  `<html><body><article class="page sans"><header>${entete}<h1 class="page-title">${titre}</h1></header><div class="page-body">${corps}</div></article></body></html>`;
// Une vraie image PNG d'un pixel.
const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64'));

/** Un export : « Accueil » (icône, image, sous-page, base de deux lignes) et « Autre », qui mentionne la sous-page par notion.so. */
async function exporter(): Promise<string> {
  const dossier = await mkdtemp(join(tmpdir(), 'notion-export-'));
  await mkdir(join(dossier, `Accueil ${a}`));
  const base = `<div class="collection-content"><h4 class="collection-title">Lectures</h4><table class="collection-content"><thead><tr><th>Nom</th><th>Note</th></tr></thead><tbody><tr><td class="cell-title"><a href="Accueil%20${a}/Livre%20${c}.html">Livre</a></td><td>5</td></tr><tr><td class="cell-title"><a href="Accueil%20${a}/Revue%20${d}.html">Revue</a></td><td>3</td></tr></tbody></table></div>`;
  await writeFile(
    join(dossier, `Accueil ${a}.html`),
    page('Accueil', `<p>Bonjour <a href="Accueil%20${a}/Cours%201.pdf">le cours</a></p><figure class="image"><img src="Accueil%20${a}/chat.png"/></figure><figure class="image"><img src="data:image/png;base64,${Buffer.from(png).toString('base64')}"/></figure><figure class="link-to-page"><a href="Accueil%20${a}/Enfant%20${b}.html">Enfant</a></figure>${base}`, '<div class="page-header-icon"><span class="icon">🏠</span></div>'),
  );
  await writeFile(join(dossier, `Accueil ${a}`, 'chat.png'), png);
  await writeFile(join(dossier, `Accueil ${a}`, 'Cours 1.pdf'), '%PDF-1.7\ncours');
  await writeFile(join(dossier, `Accueil ${a}`, `Enfant ${b}.html`), page('Enfant', '<p>Je suis l’enfant</p>'));
  await writeFile(join(dossier, `Accueil ${a}`, `Livre ${c}.html`), page('Livre', '<p>Bon livre</p>', '<table class="properties"><tr><th>Note</th><td>5</td></tr></table>'));
  await writeFile(join(dossier, `Accueil ${a}`, `Revue ${d}.html`), page('Revue', '<p>Revue</p>'));
  await writeFile(join(dossier, `Autre ${'e'.repeat(32)}.html`), page('Autre', `<p>Voir <a href="https://www.notion.so/Enfant-${b}">Enfant</a></p>`));
  return dossier;
}

async function vaultVide() {
  const base = await mkdtemp(join(tmpdir(), 'notes-notion-'));
  const vault = new VaultService(new SettingsStore(join(base, 'settings.json')), vi.fn(), join(base, 'propose'));
  const file = creerFileDAttente();
  const handlers = creerHandlersVault({ vault, file, choisirDossier: async () => join(base, 'vault') });
  await handlers.choisirDossier();
  return { vault, enSerie: handlers.enSerie, racine: join(base, 'vault') };
}

const titres = (noeuds: TreeNode[]): unknown[] => noeuds.map((noeud) => (noeud.enfants.length === 0 ? noeud.titre : [noeud.titre, titres(noeud.enfants)]));

describe('aides', () => {
  it('lit l’identifiant de Notion d’un fichier ou d’une adresse', () => {
    expect(idDeNotion(`Page ${a}.html`)).toBe(a);
    expect(idDeNotion(`https://www.notion.so/Page-${b}?pvs=4`)).toBe(b);
    expect(idDeNotion('https://www.notion.so/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'.replace(/[a-e]/g, 'f'))).toBe('f'.repeat(32));
    expect(idDeNotion('Page.html')).toBeNull();
  });

  it('ramène une adresse à un chemin de l’export, sans en sortir', () => {
    expect(cheminDansLExport('A/B.html', 'B/C%20d.html')).toBe('A/B/C d.html');
    expect(cheminDansLExport('A.html', '../hors.html')).toBeNull();
    expect(cheminDansLExport('A.html', '%E0%A4%A')).toBeNull();
  });

  it('rend un titre accepté', () => {
    expect(titreAccepte('  Mon\ttitre ')).toBe('Mon titre');
    expect(titreAccepte('')).toBe('Sans titre');
    expect(titreAccepte('x'.repeat(300))).toHaveLength(200);
  });
});

describe('analyserExport et importerExport', () => {
  it('trouve l’arborescence, les bases et les images', async () => {
    const analyse = await analyserExport(await exporter());
    expect(analyse.racines).toEqual([`Accueil ${a}.html`, `Autre ${'e'.repeat(32)}.html`]);
    expect(analyse.pages.get(`Accueil ${a}.html`)!.enfants).toEqual([`Accueil ${a}/Enfant ${b}.html`, `Accueil ${a}/Livre ${c}.html`, `Accueil ${a}/Revue ${d}.html`]);
    expect(analyse.bases).toEqual([{ cle: `Accueil ${a}.html#0`, titre: 'Lectures', page: 'Accueil', lignes: [`Accueil ${a}/Livre ${c}.html`, `Accueil ${a}/Revue ${d}.html`], csv: null, pageDeLaBase: null }]);
    expect(analyse.images).toBe(2);
  });

  it('donne l’aperçu d’une page, ses images en data: retrouvées par leur adresse', async () => {
    const analyse = await analyserExport(await exporter());
    const apercu = (await apercuDePage(analyse, `Accueil ${a}.html`))!;
    const adresses = [...apercu.corps.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((trouve) => trouve[1]!);
    expect(adresses.length).toBe(2);
    for (const adresse of adresses) {
      expect(apercu.images[decodeURIComponent(adresse)] ?? apercu.images[adresse]).toMatch(/^data:image\/png;base64,/);
    }
  });

  it('crée les pages à la racine, avec icône, image, mentions et base en tableau avec sous-pages', async () => {
    const analyse = await analyserExport(await exporter());
    const { vault, enSerie, racine } = await vaultVide();
    const progression = vi.fn();
    const resultat = await importerExport({ contexte: vault.contexte(), exportNotion: analyse, choix: new Map(), enSerie, surProgression: progression, arrete: () => false });
    expect(resultat).toEqual({ pages: 5, avertissements: [] });
    expect(progression).toHaveBeenLastCalledWith(10, 10);
    const arbre = await lireArbre(vault.contexte().fs);
    expect(titres(arbre)).toEqual([['Accueil', ['Enfant', 'Livre', 'Revue']], 'Autre']);

    const accueil = await readFile(join(racine, 'Accueil', 'page.md'), 'utf8');
    const enfant = arbre[0]!.enfants[0]!;
    const livre = arbre[0]!.enfants[1]!;
    expect(accueil).toContain('icon: 🏠\n');
    expect(accueil).toMatch(/Bonjour \[le cours\]\(assets\/Cours-1\.pdf\)\n\n!\[\]\(assets\/chat\.png\)\n\n!\[\]\(assets\/image-[0-9-]+\.png\)\n\n/);
    expect(await readFile(join(racine, 'Accueil', 'assets', 'Cours-1.pdf'), 'utf8')).toBe('%PDF-1.7\ncours');
    // « Enfant » est une sous-page : Notes la montre déjà, son bloc « page » ne reste pas dans le texte.
    expect(accueil).not.toContain(`[Enfant](notes://${enfant.id})`);
    expect(accueil).toContain(`| [Livre](notes://${livre.id}) | 5`);
    expect(await readFile(join(racine, 'Accueil', 'assets', 'chat.png'))).toEqual(Buffer.from(png));
    expect(await readFile(join(racine, 'Accueil', 'Livre', 'page.md'), 'utf8')).toContain('- **Note** : 5\n\nBon livre\n');
    expect(await readFile(join(racine, 'Autre', 'page.md'), 'utf8')).toContain(`Voir [Enfant](notes://${enfant.id})`);
    vault.arreter();
  });

  it('ne crée pas les lignes d’une base montrée en tableau seul', async () => {
    const analyse = await analyserExport(await exporter());
    const { vault, enSerie, racine } = await vaultVide();
    const resultat = await importerExport({ contexte: vault.contexte(), exportNotion: analyse, choix: new Map([[`Accueil ${a}.html#0`, 'tableau']]), enSerie, surProgression: vi.fn(), arrete: () => false });
    expect(resultat.pages).toBe(3);
    expect(titres(await lireArbre(vault.contexte().fs))).toEqual([['Accueil', ['Enfant']], 'Autre']);
    expect(await readFile(join(racine, 'Accueil', 'page.md'), 'utf8')).toContain('| Livre | 5');
    vault.arreter();
  });

  it('suit la forme des exports récents : dossiers sans identifiant, sœurs de même titre, base en CSV', async () => {
    const dossier = await mkdtemp(join(tmpdir(), 'notion-export-'));
    const e = 'e'.repeat(32);
    const f = 'f'.repeat(32);
    // Deux pages « Doublon » : seule la seconde renvoie à « Enfant », rangé dans le dossier « Doublon/ ».
    await writeFile(join(dossier, `Doublon ${a}.html`), page('Doublon', '<p>sans enfant</p>'));
    await writeFile(join(dossier, `Doublon ${b}.html`), page('Doublon', `<figure class="link-to-page"><a href="Doublon/Enfant%20${c}.html">Enfant</a></figure>`));
    await mkdir(join(dossier, 'Doublon'));
    await writeFile(join(dossier, 'Doublon', `Enfant ${c}.html`), page('Enfant', '<p>enfant</p>'));
    // Une base en pleine page : sa page renvoie au CSV, ses lignes sont dans « Colo/ ».
    await writeFile(join(dossier, `Colo ${d}.html`), page('Colo', `<a href="Colo%20${d}.csv"><code>Colo ${d}.csv</code></a><br/>`));
    await writeFile(join(dossier, `Colo ${d}.csv`), '\uFEFFNom,Étiquettes\nPong,Matin\nJeu,Soir\n');
    await mkdir(join(dossier, 'Colo'));
    await writeFile(join(dossier, 'Colo', `Pong ${e}.html`), page('Pong', '<p>pong</p>'));
    await writeFile(join(dossier, 'Colo', `Jeu ${f}.html`), page('Jeu', '<p>jeu</p>'));

    const analyse = await analyserExport(dossier);
    expect(analyse.pages.get(`Doublon ${b}.html`)!.enfants).toEqual([`Doublon/Enfant ${c}.html`]);
    expect(analyse.pages.get(`Doublon ${a}.html`)!.enfants).toEqual([]);
    expect(analyse.bases).toEqual([
      { cle: `Colo ${d}.html#0`, titre: 'Colo', page: 'Colo', lignes: [`Colo/Jeu ${f}.html`, `Colo/Pong ${e}.html`], csv: `Colo ${d}.csv`, pageDeLaBase: `Colo ${d}.html` },
    ]);

    const { vault, enSerie, racine } = await vaultVide();
    await importerExport({ contexte: vault.contexte(), exportNotion: analyse, choix: new Map(), enSerie, surProgression: vi.fn(), arrete: () => false });
    const arbre = await lireArbre(vault.contexte().fs);
    expect(titres(arbre)).toEqual([['Colo', ['Jeu', 'Pong']], 'Doublon', ['Doublon', ['Enfant']]]);
    const colo = arbre[0]!;
    const pong = colo.enfants.find((enfant) => enfant.titre === 'Pong')!;
    const jeu = colo.enfants.find((enfant) => enfant.titre === 'Jeu')!;
    const corps = await readFile(join(racine, 'Colo', 'page.md'), 'utf8');
    expect(corps).toContain(`[Pong](notes://${pong.id}) | Matin`);
    expect(corps).toContain(`[Jeu](notes://${jeu.id})`);

    // « Ne pas importer » une base en pleine page : ni sa page, ni ses lignes.
    const autre = await vaultVide();
    await importerExport({ contexte: autre.vault.contexte(), exportNotion: analyse, choix: new Map([[`Colo ${d}.html#0`, 'ignorer']]), enSerie: autre.enSerie, surProgression: vi.fn(), arrete: () => false });
    expect(titres(await lireArbre(autre.vault.contexte().fs))).toEqual(['Doublon', ['Doublon', ['Enfant']]]);
    vault.arreter();
    autre.vault.arreter();
  });

  it('signale vides, modèles, doublons et sans titre, relève les PDF, et n’importe pas les pages décochées', async () => {
    const dossier = await mkdtemp(join(tmpdir(), 'notion-export-'));
    const e = 'e'.repeat(32);
    await writeFile(join(dossier, `Vide ${a}.html`), page('Vide', '<p></p>'));
    await writeFile(join(dossier, `Accueil ${b}.html`), page('Accueil de l’espace d’équipe', '<p>Bienvenue</p>'));
    await writeFile(join(dossier, `Note ${c}.html`), page('Note', `<p>pareil</p><a href="Note/plan.pdf">plan.pdf</a>`));
    await mkdir(join(dossier, 'Note'));
    await writeFile(join(dossier, 'Note', 'plan.pdf'), '%PDF-1.7\n12345');
    await writeFile(join(dossier, `Note ${d}.html`), page('Note', `<p>pareil</p><a href="Note/plan.pdf">plan.pdf</a>`));
    await writeFile(join(dossier, `Sans titre ${e}.html`), page('', '<p>un brouillon</p>'));
    const analyse = await analyserExport(dossier);
    const signalements = Object.fromEntries([...analyse.pages.values()].map((p) => [p.fichier.slice(0, 10), p.signalements]));
    expect(signalements).toEqual({ 'Accueil bb': ['modele'], 'Note ccccc': [], 'Note ddddd': ['doublon'], 'Sans titre': ['sans-titre'], 'Vide aaaaa': ['vide'] });
    expect(analyse.pages.get(`Note ${c}.html`)!.pdf).toEqual([{ nom: 'plan.pdf', taille: 14 }]);

    const apercu = await apercuDePage(analyse, `Note ${c}.html`);
    expect(apercu?.corps).toContain('pareil');

    const { vault, enSerie } = await vaultVide();
    const resultat = await importerExport({ contexte: vault.contexte(), exportNotion: analyse, choix: new Map(), exclues: [`Vide ${a}.html`, `Accueil ${b}.html`, `Note ${d}.html`], enSerie, surProgression: vi.fn(), arrete: () => false });
    expect(resultat.pages).toBe(2);
    expect(titres(await lireArbre(vault.contexte().fs))).toEqual(['Note', 'Sans titre']);
    vault.arreter();
  });
});
