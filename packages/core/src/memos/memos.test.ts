import { describe, expect, it } from 'vitest';
import { lireArbre } from '../vault/tree';
import { MemoryLocalFs, contexteDeTest } from '../testing/memory-fs';
import { listerCorbeille, mettreMemoALaCorbeille, restaurerEntree, stockageLocal } from '../trash/trash';
import {
  cheminDeMemoValide,
  creerPageDeMemo,
  dateDuNom,
  estFichierAudio,
  listerMemos,
  nomDeMemo,
  pageDesMemos,
  pageDesMemosMasquee,
  titreDuMemo,
  trouverPageDesMemos,
} from './memos';

const moment = new Date(2026, 9, 7, 16, 24, 5).getTime();

describe('mémos vocaux', () => {
  it('reconnaît tous les formats audio courants, pas le reste', () => {
    for (const nom of ['a.m4a', 'b.AMR', 'c.3gp', 'd.wma', 'e.aiff', 'f.caf', 'g.ape', 'h.mp4', 'i.opus']) {
      expect(estFichierAudio(nom), nom).toBe(true);
    }
    for (const nom of ['notes.txt', 'photo.jpg', 'page.md', 'm4a']) {
      expect(estFichierAudio(nom), nom).toBe(false);
    }
  });

  it('lit la date dans le nom écrit par le téléphone, et l’écrit pareil', () => {
    expect(nomDeMemo(moment)).toBe('memo-2026-10-07-162405.m4a');
    expect(dateDuNom('memo-2026-10-07-162405.m4a')).toBe(moment);
    expect(dateDuNom('memo-2026-02-30-120000.m4a')).toBeNull();
    expect(dateDuNom('enregistrement.m4a')).toBeNull();
    expect(titreDuMemo(moment)).toBe('Mémo du 7 octobre 2026 à 16 h 24');
  });

  it('liste les fichiers audio en attente, du plus ancien au plus récent', async () => {
    const fs = MemoryLocalFs.depuis({
      '.notes/memos/memo-2026-10-07-162405.m4a': 'audio',
      '.notes/memos/memo-2026-10-06-090000.m4a': 'audio',
      '.notes/memos/notes.txt': 'pas un mémo',
      '.notes/memos/.memo-2026-10-08-100000.m4a.partiel': 'en cours de dépôt',
      '.notes/memos/vide.m4a': '',
    });
    const memos = await listerMemos(contexteDeTest(fs));
    expect(memos.map((memo) => memo.nom)).toEqual(['memo-2026-10-06-090000.m4a', 'memo-2026-10-07-162405.m4a']);
    expect(memos[1]).toMatchObject({ chemin: '.notes/memos/memo-2026-10-07-162405.m4a', date: moment, taille: 5 });
    expect(await listerMemos(contexteDeTest(MemoryLocalFs.depuis({})))).toEqual([]);
  });

  it('n’accepte qu’un fichier audio directement dans .notes/memos/', () => {
    expect(cheminDeMemoValide('.notes/memos/memo.m4a')).toBe(true);
    expect(cheminDeMemoValide('.notes/memos/../theme.toml')).toBe(false);
    expect(cheminDeMemoValide('.notes/memos/sous/memo.m4a')).toBe(false);
    expect(cheminDeMemoValide('Page/memo.m4a')).toBe(false);
    expect(cheminDeMemoValide('.notes/memos/page.md')).toBe(false);
  });

  it('crée la page « Mémos vocaux » une fois, reconnue par son en-tête même renommée', async () => {
    const fs = MemoryLocalFs.depuis({});
    const contexte = contexteDeTest(fs);
    expect(await trouverPageDesMemos(contexte)).toBeNull();
    const page = await pageDesMemos(contexte);
    expect(await fs.lireTexte(`${page.chemin}/page.md`)).toContain('role: memos');
    expect(await pageDesMemos(contexte)).toEqual(page);
    const arbre = await lireArbre(fs);
    expect(arbre).toEqual([expect.objectContaining({ titre: 'Mémos vocaux', role: 'memos' })]);
  });

  it('range un mémo accepté en sous-page titrée par sa date, et son audio à la corbeille, d’où il peut revenir', async () => {
    const fs = MemoryLocalFs.depuis({ '.notes/memos/memo-2026-10-07-162405.m4a': 'audio' });
    const contexte = contexteDeTest(fs);
    const sousPage = await creerPageDeMemo(contexte, { date: moment }, '# Courses\n\n- pain');
    expect(await fs.lireTexte(`${sousPage.chemin}/page.md`)).toMatch(/title: Mémo du 7 octobre 2026 à 16 h 24\n[\s\S]*---\n# Courses\n\n- pain\n$/);
    expect(sousPage.chemin.startsWith('Mémos vocaux/')).toBe(true);

    await mettreMemoALaCorbeille(contexte, '.notes/memos/memo-2026-10-07-162405.m4a', 'Mémo du 7 octobre 2026 à 16 h 24');
    expect(await listerMemos(contexte)).toEqual([]);
    const [entree] = await listerCorbeille(stockageLocal(fs));
    expect(entree).toMatchObject({ nature: 'memo', titre: 'Mémo du 7 octobre 2026 à 16 h 24' });
    await restaurerEntree(contexte, entree!.entree);
    expect((await listerMemos(contexte)).map((memo) => memo.nom)).toEqual(['memo-2026-10-07-162405.m4a']);
  });

  it('refuse de mettre autre chose qu’un mémo à la corbeille par ce chemin', async () => {
    const fs = MemoryLocalFs.depuis({ '.notes/theme.toml': '' });
    await expect(mettreMemoALaCorbeille(contexteDeTest(fs), '.notes/theme.toml', 'x')).rejects.toThrow('Ce mémo est introuvable.');
  });

  it('masque la page tant qu’aucun nouveau mémo n’arrive', () => {
    const memo = (nom: string) => ({ nom, chemin: `.notes/memos/${nom}`, date: 0, taille: 1 });
    expect(pageDesMemosMasquee(null, [])).toBe(false);
    expect(pageDesMemosMasquee(['a.m4a'], [memo('a.m4a')])).toBe(true);
    expect(pageDesMemosMasquee(['a.m4a'], [])).toBe(true);
    expect(pageDesMemosMasquee(['a.m4a'], [memo('a.m4a'), memo('b.m4a')])).toBe(false);
  });
});
