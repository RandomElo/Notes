import { describe, expect, it } from 'vitest';
import { MemoryLocalFs, contexteDeTest } from '../testing/memory-fs';
import { comparerOrdres, ecarterConflitDOrdre, estConflitDOrdre, lireConflitDOrdre, lireConflit, listerConflits, resoudreConflit } from './conflicts';

const enTete = (modifie: string) => `---\nid: 0199a0b0-0000-7000-8000-000000000001\ntitle: Alpha\ncreated: 2026-01-01T00:00:00.000Z\nupdated: ${modifie}\n---\n`;
const sauvegarde = 'Alpha/page.conflit-2026-10-03-190212.md';

function monter() {
  const fs = MemoryLocalFs.depuis({
    'Alpha/page.md': `${enTete('2026-10-03T17:04:00.000Z')}version A\n`,
    [sauvegarde]: `${enTete('2026-10-03T17:02:00.000Z')}version B\n`,
    'Alpha/.order.conflit-2026-10-03-190212': 'x\n',
    'Beta/page.md': `${enTete('2026-10-03T17:04:00.000Z')}beta\n`,
  });
  return { fs, contexte: contexteDeTest(fs) };
}

describe('conflits d’une page', () => {
  it('liste les versions de la page mises de côté, et rien d’autre', async () => {
    const { fs } = monter();
    expect(await listerConflits(fs, 'Alpha')).toEqual([sauvegarde]);
    expect(await listerConflits(fs, 'Beta')).toEqual([]);
    expect(await listerConflits(fs, 'Absente')).toEqual([]);
  });

  it('lit les deux corps et leurs dates', async () => {
    const { fs } = monter();
    expect(await lireConflit(fs, sauvegarde)).toEqual({
      page: 'Alpha',
      corpsPage: 'version A\n',
      corpsSauvegarde: 'version B\n',
      modifieLePage: '2026-10-03T17:04:00.000Z',
      modifieLeSauvegarde: '2026-10-03T17:02:00.000Z',
    });
  });

  it('refuse ce qui n’est pas une version en conflit d’une page', async () => {
    const { fs } = monter();
    await expect(lireConflit(fs, 'Alpha/page.md')).rejects.toMatchObject({ code: 'introuvable' });
    await expect(lireConflit(fs, 'Alpha/.order.conflit-2026-10-03-190212')).rejects.toMatchObject({ code: 'introuvable' });
    await expect(lireConflit(fs, 'page.conflit-2026-10-03-190212.md')).rejects.toMatchObject({ code: 'introuvable' });
  });

  it('enregistre le résultat dans la page puis supprime la sauvegarde', async () => {
    const { fs, contexte } = monter();
    expect(await resoudreConflit(contexte, sauvegarde, { corps: 'version A\n\nversion B\n', corpsDeBase: 'version A\n' })).toEqual({ ecrit: true, conflit: null });
    expect(await fs.lireTexte('Alpha/page.md')).toContain('version A\n\nversion B\n');
    expect(await listerConflits(fs, 'Alpha')).toEqual([]);
    await expect(resoudreConflit(contexte, sauvegarde, { corps: 'x\n', corpsDeBase: 'x\n' })).rejects.toMatchObject({ code: 'introuvable' });
  });

  it('garde la page modifiée entre-temps au lieu de l’écraser', async () => {
    const { fs, contexte } = monter();
    await fs.ecrireTexte('Alpha/page.md', `${enTete('2026-10-03T17:10:00.000Z')}arrivée pendant la résolution\n`);
    const resultat = await resoudreConflit(contexte, sauvegarde, { corps: 'version B\n', corpsDeBase: 'version A\n' });
    expect(resultat.conflit).not.toBeNull();
    expect(await fs.lireTexte(`Alpha/${resultat.conflit}`)).toContain('arrivée pendant la résolution');
    expect(await listerConflits(fs, 'Alpha')).toEqual([`Alpha/${resultat.conflit}`]);
  });
});

describe('conflit de l’ordre des sous-pages', () => {
  it('se reconnaît, et s’écarte en gardant l’ordre actuel', async () => {
    const { fs, contexte } = monter();
    expect(estConflitDOrdre('Alpha/.order.conflit-2026-10-03-190212')).toBe(true);
    expect(estConflitDOrdre(sauvegarde)).toBe(false);
    await ecarterConflitDOrdre(contexte, 'Alpha/.order.conflit-2026-10-03-190212');
    expect(await fs.infos('Alpha/.order.conflit-2026-10-03-190212')).toBeNull();
    await expect(ecarterConflitDOrdre(contexte, sauvegarde)).rejects.toThrow();
    expect(await fs.infos(sauvegarde)).not.toBeNull();
  });
});

describe('différence entre deux ordres', () => {
  it('marque les pages d’un seul côté et celles qui ont changé de rang', () => {
    const titres = new Map([['a', 'A'], ['b', 'B'], ['c', 'C']]);
    const { actuel, ancien } = comparerOrdres(['a', 'b', 'c'], ['b', 'a', 'z'], titres);
    expect(actuel.map((page) => [page.titre, page.difference])).toEqual([['A', 'deplacee'], ['B', 'deplacee'], ['C', 'seule']]);
    expect(ancien.map((page) => [page.titre, page.difference])).toEqual([['B', 'deplacee'], ['A', 'deplacee'], [null, 'seule']]);
  });

  it('se lit depuis le dossier, avec les titres des sous-pages', async () => {
    const fs = MemoryLocalFs.depuis({
      'Alpha/page.md': enTete('2026-10-03T17:04:00.000Z'),
      'Alpha/Une/page.md': '---\nid: 0199a0b0-0000-7000-8000-000000000011\ntitle: Une\n---\n',
      'Alpha/Deux/page.md': '---\nid: 0199a0b0-0000-7000-8000-000000000012\ntitle: Deux\n---\n',
      'Alpha/.order': '0199a0b0-0000-7000-8000-000000000012\n0199a0b0-0000-7000-8000-000000000011\n',
      'Alpha/.order.conflit-2026-10-03-190212': '0199a0b0-0000-7000-8000-000000000011\n0199a0b0-0000-7000-8000-000000000012\n',
    });
    const conflit = await lireConflitDOrdre(fs, 'Alpha/.order.conflit-2026-10-03-190212');
    expect(conflit.actuel.map((page) => page.titre)).toEqual(['Deux', 'Une']);
    expect(conflit.ancien.map((page) => [page.titre, page.difference])).toEqual([['Une', 'deplacee'], ['Deux', 'deplacee']]);
  });
});
