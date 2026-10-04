import { describe, expect, it } from 'vitest';
import { MemoryLocalFs, contexteDeTest } from '../testing/memory-fs';
import { lireCorps } from './content';
import { mentionsCassees, mentionsDuCorps, pagesQuiMentionnent, reecrireCorps } from './links';
import { lireArbre } from './tree';

const idA = '0199a0b0-0000-7000-8000-00000000000a';
const idB = '0199a0b0-0000-7000-8000-00000000000b';
const absent = '0199a0b0-0000-7000-8000-0000000000ff';
const page = (id: string, titre: string, corps: string): string =>
  `---\nid: ${id}\ntitle: ${titre}\ncreated: 2026-01-01T00:00:00.000Z\nupdated: 2026-01-01T00:00:00.000Z\n---\n${corps}`;

function monter() {
  const fs = MemoryLocalFs.depuis({
    'A/page.md': page(idA, 'A', `Voir [B](notes://${idB}) et [Perdue \\[x\\]](notes://${absent} "t").\n`),
    'B/page.md': page(idB, 'B', '```\n[A](notes://' + idA + ')\n```\n\n```notes-callout\ntext: Voir [A](NOTES://' + idA.toUpperCase() + ')\n```\n'),
    'C/page.md': page('0199a0b0-0000-7000-8000-00000000000c', 'C', `[Perdue](notes://${absent}) deux fois : [P](notes://${absent})\n`),
  });
  return { fs, contexte: contexteDeTest(fs) };
}

describe('liens entre pages', () => {
  it('repère les mentions hors des blocs de code, callouts compris', () => {
    expect(mentionsDuCorps(`a [x](notes://${idA}) b [y \\] z](notes://${idB} "t")`)).toEqual([
      { id: idA, libelle: 'x' },
      { id: idB, libelle: 'y ] z' },
    ]);
    expect(mentionsDuCorps('[x](notes://pas-un-id) [y](https://example.com)')).toEqual([]);
    expect(mentionsDuCorps('~~~\n[x](notes://' + idA + ')\n~~~\n')).toEqual([]);
  });

  it('trouve les pages qui en mentionnent une', async () => {
    const { fs } = monter();
    const arbre = await lireArbre(fs);
    expect(await pagesQuiMentionnent(fs, arbre, idB)).toEqual(['A']);
    expect(await pagesQuiMentionnent(fs, arbre, idA)).toEqual(['B']);
  });

  it('liste les mentions cassées une fois par page', async () => {
    const { fs } = monter();
    expect(await mentionsCassees(fs, await lireArbre(fs))).toEqual([
      { id: absent, libelle: 'Perdue [x]', chemin: 'A', titre: 'A' },
      { id: absent, libelle: 'Perdue', chemin: 'C', titre: 'C' },
    ]);
  });

  it('réécrit un corps en gardant le front-matter, et n’écrit rien sans changement', async () => {
    const { fs, contexte } = monter();
    const avant = fs.ecritures;
    expect(await reecrireCorps(contexte, 'A', () => null)).toBe(false);
    expect(fs.ecritures).toBe(avant);
    expect(await reecrireCorps(contexte, 'A', (corps) => corps.replace('[B]', '[Bis]'))).toBe(true);
    expect(await lireCorps(fs, 'A')).toContain(`[Bis](notes://${idB})`);
    expect(await fs.lireTexte('A/page.md')).toMatch(/^---\nid: 0199a0b0-0000-7000-8000-00000000000a\ntitle: A\n/);
  });
});
