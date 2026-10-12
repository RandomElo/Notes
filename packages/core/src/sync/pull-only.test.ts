import { describe, expect, it } from 'vitest';
import { RemoteFsError } from '../fs/remote-fs';
import { versTexte } from '../fs/utf8';
import { MemoryIndexStore, MemoryLocalFs } from '../testing/memory-fs';
import { MemoryRemoteFs } from '../testing/memory-remote-fs';
import { PullCache, estCopieDOffice } from './pull-only';

function telephone(fichiers: Record<string, string>) {
  const nas = MemoryRemoteFs.depuis(fichiers);
  const local = new MemoryLocalFs();
  const index = new MemoryIndexStore();
  const cache = new PullCache({ local, distant: nas, index, cle: 'nas/partage/notes' });
  return { nas, local, index, cache };
}

async function contenuLocal(local: MemoryLocalFs, chemin: string): Promise<string> {
  return versTexte(await local.lireOctets(chemin));
}

describe('ce qui est copié d’office', () => {
  it('garde le texte des pages, l’ordre et le thème', () => {
    expect(estCopieDOffice('Courses/page.md')).toBe(true);
    expect(estCopieDOffice('Note externe.md')).toBe(true);
    expect(estCopieDOffice('Projets/.order')).toBe(true);
    expect(estCopieDOffice('.notes/theme.toml')).toBe(true);
  });

  it('laisse les images, les sauvegardes de conflit et le reste de .notes pour plus tard', () => {
    expect(estCopieDOffice('Bienvenue/assets/schema.png')).toBe(false);
    expect(estCopieDOffice('Bienvenue/assets/notes.md')).toBe(false);
    expect(estCopieDOffice('Courses/page.conflit-2026-10-02-141503.md')).toBe(false);
    expect(estCopieDOffice('.notes/memos/memo-2026-10-07-162400.m4a')).toBe(false);
    expect(estCopieDOffice('.notes/ai-usage.json')).toBe(false);
  });
});

describe('cycle de la sync descendante', () => {
  it('copie les pages au premier passage, sans les images', async () => {
    const { local, cache } = telephone({
      'Courses/page.md': 'lait\n',
      'Bienvenue/page.md': 'bonjour\n',
      'Bienvenue/assets/schema.png': 'png',
      '.order': 'Courses\n',
      '.notes/theme.toml': '[couleurs]\n',
      '.notes/ai-usage.json': '[]',
    });
    const progression: [number, number][] = [];
    const rapport = await cache.tirer((faits, total) => progression.push([faits, total]));
    expect(rapport.copies).toEqual(['.notes/theme.toml', '.order', 'Bienvenue/page.md', 'Courses/page.md']);
    expect(progression.at(0)).toEqual([0, 4]);
    expect(progression.at(-1)).toEqual([4, 4]);
    expect(await contenuLocal(local, 'Courses/page.md')).toBe('lait\n');
    expect(await local.infos('Bienvenue/assets/schema.png')).toBeNull();
    expect(await local.infos('.notes/ai-usage.json')).toBeNull();
  });

  it('ne recopie rien quand rien n’a changé', async () => {
    const { nas, cache } = telephone({ 'Courses/page.md': 'lait\n' });
    await cache.tirer();
    const lectures = compterLectures(nas);
    const rapport = await cache.tirer();
    expect(rapport.copies).toEqual([]);
    expect(lectures()).toBe(0);
  });

  it('recopie une page modifiée sur le NAS', async () => {
    const { nas, local, cache } = telephone({ 'Courses/page.md': 'lait\n' });
    await cache.tirer();
    nas.poser('Courses/page.md', 'lait\npain\n');
    const rapport = await cache.tirer();
    expect(rapport.copies).toEqual(['Courses/page.md']);
    expect(await contenuLocal(local, 'Courses/page.md')).toBe('lait\npain\n');
  });

  it('retire du cache une page supprimée ou déplacée sur le NAS', async () => {
    const { nas, local, cache } = telephone({ 'Courses/page.md': 'lait\n', 'Projets/Site/page.md': 'site\n', 'Projets/page.md': 'projets\n' });
    await cache.tirer();
    nas.retirer('Courses');
    nas.retirer('Projets/Site');
    nas.poser('Site/page.md', 'site\n');
    const rapport = await cache.tirer();
    expect(rapport.retires.sort()).toEqual(['Courses', 'Projets/Site']);
    expect(rapport.copies).toEqual(['Site/page.md']);
    expect(await local.infos('Courses')).toBeNull();
    expect(await contenuLocal(local, 'Projets/page.md')).toBe('projets\n');
  });

  it('remet une page effacée du cache', async () => {
    const { local, cache } = telephone({ 'Courses/page.md': 'lait\n' });
    await cache.tirer();
    await local.supprimer('Courses/page.md');
    expect((await cache.tirer()).copies).toEqual(['Courses/page.md']);
  });

  it('ne vide pas le cache quand le NAS ne montre plus rien', async () => {
    const { nas, local, cache } = telephone({ 'Courses/page.md': 'lait\n' });
    await cache.tirer();
    nas.retirer('Courses');
    const rapport = await cache.tirer();
    expect(rapport.distantVide).toBe(true);
    expect(rapport.retires).toEqual([]);
    expect(await contenuLocal(local, 'Courses/page.md')).toBe('lait\n');
  });

  it('ne copie ni les verrous ni la corbeille du NAS', async () => {
    const { local, cache } = telephone({ 'Courses/page.md': 'lait\n', 'Courses/.lock': '{}', '.trash/x/page.md': 'vieux\n' });
    await cache.tirer();
    expect(await local.infos('Courses/.lock')).toBeNull();
    expect(await local.infos('.trash')).toBeNull();
  });

  it('garde ce qui est copié quand le NAS tombe au milieu, et reprend la suite', async () => {
    const { nas, local, cache } = telephone({ 'A/page.md': 'a\n', 'B/page.md': 'b\n', 'C/page.md': 'c\n' });
    nas.echouerSur = (operation, chemin) => operation === 'lire' && chemin === 'B/page.md';
    await expect(cache.tirer()).rejects.toThrow();
    expect(await contenuLocal(local, 'A/page.md')).toBe('a\n');
    nas.echouerSur = null;
    expect((await cache.tirer()).copies).toEqual(['B/page.md', 'C/page.md']);
  });

  it('repart de zéro pour un autre NAS', async () => {
    const { nas, local, index } = telephone({ 'Courses/page.md': 'lait\n' });
    await new PullCache({ local, distant: nas, index, cle: 'premier' }).tirer();
    const autre = MemoryRemoteFs.depuis({ 'Journal/page.md': 'journal\n' });
    const rapport = await new PullCache({ local, distant: autre, index, cle: 'second' }).tirer();
    expect(rapport.copies).toEqual(['Journal/page.md']);
    expect(rapport.retires).toEqual(['Courses']);
  });
});

describe('fichiers à la demande', () => {
  it('télécharge une image une fois, puis la lit dans le cache, même sans NAS', async () => {
    const { nas, local, cache } = telephone({ 'Bienvenue/page.md': 'x\n', 'Bienvenue/assets/schema.png': 'png' });
    await cache.tirer();
    expect(versTexte(await cache.lire('Bienvenue/assets/schema.png'))).toBe('png');
    expect(await contenuLocal(local, 'Bienvenue/assets/schema.png')).toBe('png');
    nas.panne = true;
    expect(versTexte(await cache.lire('Bienvenue/assets/schema.png'))).toBe('png');
  });

  it('échoue avec l’erreur du NAS pour une image jamais vue, sans NAS', async () => {
    const { nas, cache } = telephone({ 'Bienvenue/page.md': 'x\n', 'Bienvenue/assets/schema.png': 'png' });
    await cache.tirer();
    nas.panne = true;
    await expect(cache.lire('Bienvenue/assets/schema.png')).rejects.toBeInstanceOf(RemoteFsError);
  });

  it('oublie une image changée ou retirée sur le NAS, pour la recharger à la prochaine lecture', async () => {
    const { nas, local, cache } = telephone({ 'Bienvenue/page.md': 'x\n', 'Bienvenue/assets/a.png': 'a1', 'Bienvenue/assets/b.png': 'b' });
    await cache.tirer();
    await cache.lire('Bienvenue/assets/a.png');
    await cache.lire('Bienvenue/assets/b.png');
    nas.poser('Bienvenue/assets/a.png', 'a2');
    nas.retirer('Bienvenue/assets/b.png');
    const rapport = await cache.tirer();
    expect(rapport.retires.sort()).toEqual(['Bienvenue/assets/a.png', 'Bienvenue/assets/b.png']);
    expect(await local.infos('Bienvenue/assets/a.png')).toBeNull();
    expect(versTexte(await cache.lire('Bienvenue/assets/a.png'))).toBe('a2');
  });

  it('refuse un chemin qui sort du dossier des notes', async () => {
    const { cache } = telephone({ 'Bienvenue/page.md': 'x\n' });
    await expect(cache.lire('../secret')).rejects.toThrow();
  });
});

function compterLectures(nas: MemoryRemoteFs): () => number {
  let lectures = 0;
  nas.avantOperation = (operation) => {
    if (operation === 'lire') {
      lectures++;
    }
  };
  return () => lectures;
}

describe('dates des pages', () => {
  it('donne la date du NAS de chaque page copiée, par dossier', async () => {
    const { nas, cache } = telephone({ 'page.md': 'racine', 'Courses/page.md': 'a', 'Courses/.order': '', 'Projets/Notes/page.md': 'b', 'Projets/note.md': 'externe' });
    await cache.tirer();
    const dates = await cache.datesDesPages();
    expect([...dates.keys()].sort()).toEqual(['', 'Courses', 'Projets/Notes']);
    nas.poser('Courses/page.md', 'a modifiée');
    await cache.tirer();
    expect((await cache.datesDesPages()).get('Courses')).toBeGreaterThan(dates.get('Projets/Notes')!);
  });
});
