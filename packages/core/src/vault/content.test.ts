import { describe, expect, it } from 'vitest';
import { nomDuFichierDeConflit } from '../page/conflict';
import { MemoryLocalFs, contexteDeTest } from '../testing/memory-fs';
import { enregistrerCorps, lireContenu, lireCorps } from './content';
import { lireArbre } from './tree';

const enTete = '---\nid: 0199a0b0-0000-7000-8000-000000000001\n# un commentaire à garder\ntitle: Alpha\ncle_inconnue: 12\ncreated: 2026-01-01T00:00:00.000Z\nupdated: 2026-01-01T00:00:00.000Z\n---\n';

function monter(corps = 'texte de départ\n') {
  const fs = MemoryLocalFs.depuis({ 'Alpha/page.md': enTete + corps, 'volante.md': '# Note\n', 'Brute/page.md': 'sans en-tête\n' });
  return { fs, contexte: contexteDeTest(fs) };
}

describe('lireCorps', () => {
  it('rend le corps sans le front-matter, sans rien écrire', async () => {
    const { fs } = monter();
    expect(await lireCorps(fs, 'Alpha')).toBe('texte de départ\n');
    expect(await lireCorps(fs, 'volante.md')).toBe('# Note\n');
    expect(await lireCorps(fs, 'Brute')).toBe('sans en-tête\n');
    expect(fs.ecritures).toBe(0);
  });

  it('refuse ce qui n’existe pas', async () => {
    const { fs } = monter();
    await expect(lireCorps(fs, 'Absente')).rejects.toMatchObject({ code: 'introuvable' });
    await expect(lireCorps(fs, '')).rejects.toMatchObject({ code: 'introuvable' });
  });
});

describe('lireContenu', () => {
  const avec = (surcharges: string): MemoryLocalFs =>
    MemoryLocalFs.depuis({ 'Alpha/page.md': enTete.replace('title: Alpha\n', `title: Alpha\n${surcharges}`) + 'corps\n' });

  it('rend le corps et les surcharges de thème telles qu’elles sont écrites', async () => {
    const fs = avec('theme_overrides:\n  accent: "#ff8800"\n  background: 000\n');
    expect(await lireContenu(fs, 'Alpha')).toMatchObject({ corps: 'corps\n', surcharges: { accent: '#ff8800', background: '000' } });
    expect((await lireContenu(fs, 'Alpha')).enTete).toContain('theme_overrides:');
    expect((await lireContenu(monter().fs, 'volante.md')).enTete).toBeNull();
    expect(fs.ecritures).toBe(0);
  });

  it('rend des surcharges vides quand il n’y en a pas ou qu’elles sont mal formées', async () => {
    expect((await lireContenu(monter().fs, 'Alpha')).surcharges).toEqual({});
    expect((await lireContenu(monter().fs, 'volante.md')).surcharges).toEqual({});
    expect((await lireContenu(avec('theme_overrides: rouge\n'), 'Alpha')).surcharges).toEqual({});
    expect((await lireContenu(avec('theme_overrides: [a, b]\n'), 'Alpha')).surcharges).toEqual({});
    // Une valeur qui n'est pas un texte simple est écartée, les autres gardées.
    expect((await lireContenu(avec('theme_overrides:\n  accent:\n    a: 1\n  text: "#fff"\n'), 'Alpha')).surcharges).toEqual({ text: '#fff' });
  });
});

describe('enregistrerCorps', () => {
  it('n’écrit rien si le corps n’a pas changé', async () => {
    const { fs, contexte } = monter();
    expect(await enregistrerCorps(contexte, 'Alpha', { corps: 'texte de départ\n', corpsDeBase: 'texte de départ\n' })).toEqual({ ecrit: false, conflit: null });
    expect(fs.ecritures).toBe(0);
  });

  it('remplace le corps, garde le front-matter et ne change que la date de modification', async () => {
    const { fs, contexte } = monter();
    expect(await enregistrerCorps(contexte, 'Alpha', { corps: 'nouveau texte\n', corpsDeBase: 'texte de départ\n' })).toEqual({ ecrit: true, conflit: null });
    const ecrit = await fs.lireTexte('Alpha/page.md');
    expect(ecrit.replace(/^updated: .*$/m, 'updated: X')).toBe(enTete.replace(/^updated: .*$/m, 'updated: X') + 'nouveau texte\n');
    expect(ecrit).not.toContain('updated: 2026-01-01T00:00:00.000Z');
    expect(Object.keys(fs.contenu())).toEqual(['Alpha/page.md', 'Brute/page.md', 'volante.md']);
  });

  it('garde la version du disque à côté quand le fichier a changé depuis sa lecture', async () => {
    const { fs, contexte } = monter();
    // Un autre outil modifie la page pendant que l'utilisateur écrit.
    const modifieAilleurs = enTete + 'texte changé ailleurs\n';
    await fs.ecrireTexte('Alpha/page.md', modifieAilleurs);

    const resultat = await enregistrerCorps(contexte, 'Alpha', { corps: 'mon texte\n', corpsDeBase: 'texte de départ\n' });
    expect(resultat.ecrit).toBe(true);
    expect(resultat.conflit).toMatch(/^page\.conflit-\d{4}-\d{2}-\d{2}-\d{6}\.md$/);
    expect(await fs.lireTexte(`Alpha/${resultat.conflit}`)).toBe(modifieAilleurs);
    expect(await lireCorps(fs, 'Alpha')).toBe('mon texte\n');
    // La sauvegarde n'est pas une page : elle ne paraît pas dans l'arborescence.
    expect((await lireArbre(fs)).map((noeud) => noeud.titre)).toEqual(['Alpha', 'Brute', 'volante']);
  });

  it('ne signale pas de conflit si le disque contient déjà ce qu’on veut écrire', async () => {
    const { fs, contexte } = monter();
    await fs.ecrireTexte('Alpha/page.md', enTete + 'même texte\n');
    expect(await enregistrerCorps(contexte, 'Alpha', { corps: 'même texte\n', corpsDeBase: 'texte de départ\n' })).toEqual({ ecrit: false, conflit: null });
  });

  it('écrit un corps dans une page qui s’arrêtait juste après son front-matter', async () => {
    const fs = MemoryLocalFs.depuis({ 'Alpha/page.md': enTete.slice(0, -1) });
    await enregistrerCorps(contexteDeTest(fs), 'Alpha', { corps: 'premier texte\n', corpsDeBase: '' });
    expect(await fs.lireTexte('Alpha/page.md')).toMatch(/\n---\npremier texte\n$/);
    expect(await lireCorps(fs, 'Alpha')).toBe('premier texte\n');
  });

  it('refuse une page non importée ou absente', async () => {
    const { fs, contexte } = monter();
    await expect(enregistrerCorps(contexte, 'Brute', { corps: 'x', corpsDeBase: 'sans en-tête\n' })).rejects.toMatchObject({ code: 'non_importee' });
    await expect(enregistrerCorps(contexte, 'Absente', { corps: 'x', corpsDeBase: '' })).rejects.toMatchObject({ code: 'introuvable' });
    expect(fs.ecritures).toBe(0);
  });
});

describe('nomDuFichierDeConflit', () => {
  it('date le fichier à la seconde, sans caractère refusé par SMB, et évite les doublons', () => {
    const date = new Date(2026, 9, 2, 14, 5, 3);
    expect(nomDuFichierDeConflit(date)).toBe('page.conflit-2026-10-02-140503.md');
    expect(nomDuFichierDeConflit(date, ['page.conflit-2026-10-02-140503.md'])).toBe('page.conflit-2026-10-02-140503-2.md');
  });
});
