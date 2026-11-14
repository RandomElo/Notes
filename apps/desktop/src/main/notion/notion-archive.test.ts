import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { cheminDEntree, extraireArchives } from './notion-archive';

describe('cheminDEntree', () => {
  it('refuse ce qui sortirait du dossier', () => {
    expect(cheminDEntree('/tmp/x', 'a/b.html')).toBe('/tmp/x/a/b.html');
    expect(cheminDEntree('/tmp/x', '../a.html')).toBeNull();
    expect(cheminDEntree('/tmp/x', 'a/../../b')).toBeNull();
    expect(cheminDEntree('/tmp/x', '/etc/passwd')).toBeNull();
    expect(cheminDEntree('/tmp/x', 'C:\\\\a')).toBeNull();
  });
});

describe('extraireArchives', () => {
  it('extrait plusieurs archives, et celles qu’elles contiennent', async () => {
    const base = await mkdtemp(join(tmpdir(), 'notion-'));
    const interne = zipSync({ 'Page 0123.html': strToU8('<p>page</p>'), 'Page 0123/chat.png': new Uint8Array([1, 2, 3]) });
    await writeFile(join(base, 'Export-Part-1.zip'), zipSync({ 'Export-Part-1.zip': interne, '../evasion.txt': strToU8('non') }));
    await writeFile(join(base, 'Export-Part-2.zip'), zipSync({ 'Autre 4567.html': strToU8('<p>autre</p>') }));
    const dossier = join(base, 'extrait');
    await extraireArchives([join(base, 'Export-Part-1.zip'), join(base, 'Export-Part-2.zip')], dossier);
    expect((await readdir(dossier, { recursive: true })).sort()).toEqual(['Autre 4567.html', 'Page 0123', 'Page 0123.html', 'Page 0123/chat.png']);
    expect(await readFile(join(dossier, 'Page 0123.html'), 'utf8')).toBe('<p>page</p>');
    expect(await readdir(base)).not.toContain('evasion.txt');
  });

  it('échoue sur un fichier qui n’est pas une archive', async () => {
    const base = await mkdtemp(join(tmpdir(), 'notion-'));
    await writeFile(join(base, 'faux.zip'), 'pas une archive');
    await expect(extraireArchives([join(base, 'faux.zip')], join(base, 'extrait'))).rejects.toThrow();
  });
});
