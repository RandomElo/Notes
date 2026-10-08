import { describe, expect, it } from 'vitest';
import { MemoryLocalFs, contexteDeTest } from '../testing/memory-fs';
import { changerMode } from './page-mode';
import { lireArbre } from './tree';

const page = '---\nid: 0199a0b0-0000-7000-8000-000000000001\ntitle: Courses\n# commentaire gardé\ncreated: 2026-01-01T00:00:00.000Z\nupdated: 2026-01-01T00:00:00.000Z\n---\n- [ ] pain\n';

describe('mode liste de tâches', () => {
  it('écrit puis retire `mode: todo` sans toucher au corps ni au reste du front-matter', async () => {
    const fs = MemoryLocalFs.depuis({ 'Courses/page.md': page });
    const contexte = contexteDeTest(fs);
    await changerMode(contexte, 'Courses', 'todo');
    expect((await lireArbre(fs))[0]?.mode).toBe('todo');
    const ecrit = await fs.lireTexte('Courses/page.md');
    expect(ecrit).toContain('mode: todo');
    expect(ecrit).toContain('# commentaire gardé');
    expect(ecrit).toMatch(/---\n- \[ \] pain\n$/);
    await changerMode(contexte, 'Courses', null);
    expect((await lireArbre(fs))[0]?.mode).toBeNull();
    expect(await fs.lireTexte('Courses/page.md')).not.toContain('mode:');
  });

  it("n'écrit rien quand le mode est déjà le bon", async () => {
    const fs = MemoryLocalFs.depuis({ 'Courses/page.md': page });
    await changerMode(contexteDeTest(fs), 'Courses', null);
    expect(await fs.lireTexte('Courses/page.md')).toBe(page);
  });
});
