import { mkdtemp, mkdir, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { NodeLocalFs } from './node-local-fs';

let racine: string;
let fs: NodeLocalFs;

beforeEach(async () => {
  racine = await mkdtemp(join(tmpdir(), 'notes-vault-'));
  fs = new NodeLocalFs(racine);
});

describe('NodeLocalFs', () => {
  it('écrit, relit et liste, sans laisser de fichier temporaire', async () => {
    await fs.creerDossier('Projets/Refonte du NAS');
    await fs.ecrireTexte('Projets/page.md', 'contenu\r\navec fin de ligne Windows\n');
    await fs.ecrireTexte('Projets/page.md', '﻿remplacé, marque d’ordre d’octets gardée');

    expect(await fs.lireTexte('Projets/page.md')).toBe('﻿remplacé, marque d’ordre d’octets gardée');
    expect((await readdir(join(racine, 'Projets'))).sort()).toEqual(['Refonte du NAS', 'page.md']);
    expect((await fs.lister('Projets')).map((entree) => [entree.nom, entree.estDossier]).sort()).toEqual([
      ['Refonte du NAS', true],
      ['page.md', false],
    ]);
    expect(await fs.infos('Projets/page.md')).toMatchObject({ nom: 'page.md', estDossier: false });
    expect(await fs.infos('Projets/absent.md')).toBeNull();
    expect(await fs.infos('')).toMatchObject({ estDossier: true });
  });

  it('renomme et copie sans jamais écraser', async () => {
    await fs.ecrireTexte('a.md', 'A');
    await fs.ecrireTexte('b.md', 'B');
    await expect(fs.renommer('a.md', 'b.md')).rejects.toMatchObject({ code: 'existe_deja' });
    await expect(fs.copierFichier('a.md', 'b.md')).rejects.toMatchObject({ code: 'existe_deja' });
    expect(await fs.lireTexte('b.md')).toBe('B');

    await fs.renommer('a.md', 'c.md');
    await fs.copierFichier('c.md', 'd.md');
    expect(await fs.lireTexte('d.md')).toBe('A');
    expect(await fs.infos('a.md')).toBeNull();
  });

  it('accepte un renommage qui ne change que la casse', async () => {
    await fs.creerDossier('projets');
    await fs.renommer('projets', 'Projets');
    expect((await fs.lister('')).map((entree) => entree.nom)).toEqual(['Projets']);
  });

  it('supprime un dossier avec son contenu et signale ce qui est introuvable', async () => {
    await fs.creerDossier('Vieux/Sous');
    await fs.ecrireTexte('Vieux/Sous/page.md', 'x');
    await fs.supprimer('Vieux');
    expect(await fs.infos('Vieux')).toBeNull();
    await expect(fs.supprimer('Vieux')).rejects.toMatchObject({ code: 'introuvable' });
    await expect(fs.lireTexte('absent.md')).rejects.toMatchObject({ code: 'introuvable' });
    await expect(fs.lister('absent')).rejects.toMatchObject({ code: 'introuvable' });
    await expect(fs.ecrireTexte('absent/page.md', 'x')).rejects.toMatchObject({ code: 'introuvable' });
  });

  it('refuse tout chemin qui sortirait du vault', async () => {
    await writeFile(join(racine, '..', 'hors-vault.txt'), 'secret').catch(() => undefined);
    for (const chemin of ['../hors-vault.txt', '/etc/passwd', 'a/../../x', 'a\\b', '']) {
      await expect(fs.lireTexte(chemin)).rejects.toMatchObject({ code: 'chemin_invalide' });
      await expect(fs.ecrireTexte(chemin, 'x')).rejects.toMatchObject({ code: 'chemin_invalide' });
      await expect(fs.supprimer(chemin)).rejects.toMatchObject({ code: 'chemin_invalide' });
    }
  });

  it('ne suit pas les liens symboliques', async () => {
    const dehors = await mkdtemp(join(tmpdir(), 'notes-dehors-'));
    await writeFile(join(dehors, 'page.md'), 'hors du vault');
    await mkdir(join(racine, 'Vrai'));
    await symlink(dehors, join(racine, 'Lien'));
    await symlink(join(dehors, 'page.md'), join(racine, 'lien.md'));

    expect((await fs.lister('')).map((entree) => entree.nom)).toEqual(['Vrai']);
    expect(await fs.infos('Lien')).toBeNull();
    expect(await fs.infos('lien.md')).toBeNull();
    expect(await readFile(join(dehors, 'page.md'), 'utf8')).toBe('hors du vault');
  });
});
