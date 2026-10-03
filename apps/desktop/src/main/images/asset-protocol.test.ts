import { MemoryLocalFs } from '@notes/core/testing';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ protocol: {} }));
const { repondreImage } = await import('./asset-protocol');

const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

describe('protocole des images', () => {
  const fs = MemoryLocalFs.depuis({ 'Alpha/page.md': 'x', 'Alpha/assets/fausse.png': '#!/bin/sh', 'Alpha/notes.txt': 'secret' });
  void fs.ecrireOctets('Alpha/assets/été 1.png', png);

  it('sert une image du dossier des notes, avec son vrai type', async () => {
    const reponse = await repondreImage('notes-asset://vault/Alpha/assets/%C3%A9t%C3%A9%201.png', fs);
    expect(reponse.status).toBe(200);
    expect(reponse.headers.get('Content-Type')).toBe('image/png');
    expect(new Uint8Array(await reponse.arrayBuffer())).toEqual(png);
  });

  it('refuse tout le reste', async () => {
    for (const adresse of [
      'notes-asset://vault/Alpha/page.md',
      'notes-asset://vault/Alpha/notes.txt',
      'notes-asset://vault/Alpha/assets/fausse.png',
      'notes-asset://vault/Alpha/assets/absente.png',
      'notes-asset://vault/../etc/passwd.png',
      'notes-asset://vault/Alpha/assets/..%2F..%2Fx.png',
      'notes-asset://autre/Alpha/assets/%C3%A9t%C3%A9%201.png',
      'notes-asset://vault/Alpha/assets/%C3%A9t%C3%A9%201.png?x=1',
      'file:///etc/passwd',
      'pas une adresse',
    ]) {
      expect((await repondreImage(adresse, fs)).status, adresse).toBe(404);
    }
    expect((await repondreImage('notes-asset://vault/Alpha/assets/%C3%A9t%C3%A9%201.png', null)).status).toBe(404);
  });
});
