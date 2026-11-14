import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ErrorLog, tailleMaximale, texteDeLEntree } from './error-log';

const date = new Date('2026-10-12T20:30:00.000Z');

describe('texteDeLEntree', () => {
  it('écrit date, version, origine et message sur une ligne, le détail décalé dessous', () => {
    expect(texteDeLEntree({ origine: 'affichage', message: 'TypeError: x\nest indéfini', detail: 'at a (b.js:1)\nat c (d.js:2)' }, '0.18.6', date)).toBe(
      '2026-10-12T20:30:00.000Z [0.18.6] affichage : TypeError: x est indéfini\n    at a (b.js:1)\n    at c (d.js:2)\n',
    );
  });

  it('coupe un message trop long', () => {
    const texte = texteDeLEntree({ origine: 'main', message: 'a'.repeat(5000) }, '1.0.0', date);
    expect(texte.length).toBeLessThan(2100);
    expect(texte).toContain('… (coupé)');
  });
});

describe('ErrorLog', () => {
  it('ajoute les entrées à la suite', async () => {
    const chemin = join(await mkdtemp(join(tmpdir(), 'journal-')), 'erreurs.log');
    const journal = new ErrorLog(chemin, '1.0.0', () => date);
    journal.noter({ origine: 'main', message: 'un' });
    journal.noter({ origine: 'main', message: 'deux' });
    expect(await readFile(chemin, 'utf8')).toBe(`${date.toISOString()} [1.0.0] main : un\n${date.toISOString()} [1.0.0] main : deux\n`);
  });

  it('garde un seul fichier précédent quand il devient trop gros', async () => {
    const dossier = await mkdtemp(join(tmpdir(), 'journal-'));
    const chemin = join(dossier, 'erreurs.log');
    await writeFile(chemin, 'x'.repeat(tailleMaximale - 10));
    new ErrorLog(chemin, '1.0.0', () => date).noter({ origine: 'main', message: 'nouvelle' });
    expect((await readFile(join(dossier, 'erreurs.1.log'), 'utf8')).length).toBe(tailleMaximale - 10);
    expect(await readFile(chemin, 'utf8')).toContain('nouvelle');
  });

  it('ne note pas plus de trente erreurs par minute, et le dit une fois', async () => {
    const chemin = join(await mkdtemp(join(tmpdir(), 'journal-')), 'erreurs.log');
    let instant = date.getTime();
    const journal = new ErrorLog(chemin, '1.0.0', () => new Date(instant));
    for (let i = 0; i < 40; i++) {
      journal.noter({ origine: 'affichage', message: `erreur ${i}` });
    }
    let lignes = (await readFile(chemin, 'utf8')).trim().split('\n');
    expect(lignes).toHaveLength(31);
    expect(lignes.at(-1)).toContain('les suivantes ne sont pas notées');
    instant += 61_000;
    journal.noter({ origine: 'affichage', message: 'après' });
    lignes = (await readFile(chemin, 'utf8')).trim().split('\n');
    expect(lignes.at(-1)).toContain('après');
  });

  it('ne lève jamais, même sans pouvoir écrire', () => {
    expect(() => new ErrorLog('/dossier/qui/n/existe/pas/erreurs.log', '1.0.0').noter({ origine: 'main', message: 'x' })).not.toThrow();
  });
});
