import { describe, expect, it } from 'vitest';
import { MemoryLocalFs, contexteDeTest } from '../testing/memory-fs';
import { lireConflit, listerConflits, resoudreConflit } from './conflicts';

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
