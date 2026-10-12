import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { lireCapacite, raisonDeRefus } from './capacity';

const go = 1024 ** 3;

describe('le poste permet-il LanguageTool ?', () => {
  it('accepte assez de mémoire et de place', () => {
    expect(raisonDeRefus({ memoire: 31 * go, processeurs: 16, libre: 100 * go })).toBeNull();
    expect(raisonDeRefus({ memoire: 16 * go, processeurs: 8, libre: null })).toBeNull();
  });

  it('refuse avec la raison', () => {
    expect(raisonDeRefus({ memoire: 8 * go, processeurs: 16, libre: 100 * go })).toContain('8 Go de mémoire vive');
    expect(raisonDeRefus({ memoire: 32 * go, processeurs: 4, libre: 100 * go })).toContain('4 cœurs');
    expect(raisonDeRefus({ memoire: 32 * go, processeurs: 16, libre: 3 * go })).toContain('Il reste 3 Go libres');
  });

  it('lit la place libre d’un dossier qui n’existe pas encore par son parent', async () => {
    const dossier = await mkdtemp(join(tmpdir(), 'notes-capacite-'));
    const capacite = await lireCapacite(join(dossier, 'LanguageTool', 'plus-loin'));
    expect(capacite.memoire).toBeGreaterThan(0);
    expect(capacite.processeurs).toBeGreaterThan(0);
    expect(capacite.libre).toBeGreaterThan(0);
  });
});
