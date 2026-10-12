import { describe, expect, it } from 'vitest';
import { RemoteFsError } from '../fs/remote-fs';
import { versTexte } from '../fs/utf8';
import { decouperPage } from '../page/front-matter';
import { MemoryIndexStore, MemoryLocalFs } from '../testing/memory-fs';
import { MemoryRemoteFs } from '../testing/memory-remote-fs';
import { creerPageSurLeNas, modifierPageSurLeNas } from './direct-write';
import type { DirectWriteContext } from './direct-write';
import { synchroniser } from './engine';
import { LockManager, ecrireVerrou } from './lock';
import { PullCache } from './pull-only';

const instant = Date.UTC(2026, 9, 10, 18, 0, 0);
const page = (corps: string) => `---\nid: 0199a0b0-0000-7000-8000-000000000002\ntitle: Courses\nupdated: 2026-10-01T08:00:00.000Z\n---\n${corps}`;

function telephone(fichiers: Record<string, string>) {
  const nas = MemoryRemoteFs.depuis(fichiers);
  const local = new MemoryLocalFs();
  const cache = new PullCache({ local, distant: nas, index: new MemoryIndexStore(), cle: 'nas' });
  const verrous = new LockManager(nas, { appareil: 'telephone', nom: 'téléphone', pid: 0 }, () => instant);
  let graine = 0;
  const contexte: DirectWriteContext & { octetsAleatoires(taille: number): Uint8Array; cache: MemoryLocalFs } = {
    distant: nas,
    verrous,
    maintenant: () => instant,
    copierDansLeCache: (chemin, contenu) => cache.noterCopie(chemin, contenu),
    octetsAleatoires: (taille) => new Uint8Array(taille).fill(++graine),
    cache: local,
  };
  return { nas, local, cache, verrous, contexte };
}

const cocherLait = (corps: string) => corps.replace('- [ ] lait', '- [x] lait');

describe('modifierPageSurLeNas', () => {
  it('écrit sur le NAS, met le cache à jour et retire le verrou', async () => {
    const { nas, local, cache, contexte } = telephone({ 'Courses/page.md': page('- [ ] lait\n- [ ] pain\n') });
    await cache.tirer();
    const resultat = await modifierPageSurLeNas(contexte, 'Courses', { corpsAttendu: '- [ ] lait\n- [ ] pain\n', operation: cocherLait });
    expect(resultat.ok).toBe(true);
    const surLeNas = nas.contenu()['Courses/page.md']!;
    expect(decouperPage(surLeNas).corps).toBe('- [x] lait\n- [ ] pain\n');
    expect(surLeNas).toContain('updated: 2026-10-10T18:00:00.000Z');
    expect(surLeNas).toContain('title: Courses');
    expect(versTexte(await local.lireOctets('Courses/page.md'))).toBe(surLeNas);
    expect(nas.contenu()['Courses/.lock']).toBeUndefined();
    // Le cycle suivant n'a rien à recopier.
    expect((await cache.tirer()).copies).toEqual([]);
  });

  it('refuse sans rien écrire quand un autre appareil édite la page', async () => {
    const { nas, contexte } = telephone({ 'Courses/page.md': page('- [ ] lait\n') });
    nas.poser('Courses/.lock', ecrireVerrou({ appareil: 'poste', nom: 'pc-fixe', pid: 4, heartbeat: instant - 5_000 }));
    const avant = nas.contenu()['Courses/page.md'];
    const resultat = await modifierPageSurLeNas(contexte, 'Courses', { corpsAttendu: null, operation: cocherLait });
    expect(resultat).toEqual({ ok: false, raison: 'verrou', nom: 'pc-fixe' });
    expect(nas.contenu()['Courses/page.md']).toBe(avant);
    expect(nas.contenu()['Courses/.lock']).toContain('poste');
  });

  it('reprend un verrou périmé', async () => {
    const { nas, contexte } = telephone({ 'Courses/page.md': page('- [ ] lait\n') });
    nas.poser('Courses/.lock', ecrireVerrou({ appareil: 'poste', nom: 'pc-fixe', pid: 4, heartbeat: instant - 120_000 }));
    expect((await modifierPageSurLeNas(contexte, 'Courses', { corpsAttendu: null, operation: cocherLait })).ok).toBe(true);
    expect(nas.contenu()['Courses/.lock']).toBeUndefined();
  });

  it('refuse une page changée depuis son affichage et met le cache à jour', async () => {
    const { nas, local, cache, contexte } = telephone({ 'Courses/page.md': page('- [ ] lait\n') });
    await cache.tirer();
    nas.poser('Courses/page.md', page('- [ ] lait\n- [ ] œufs\n'));
    const resultat = await modifierPageSurLeNas(contexte, 'Courses', { corpsAttendu: '- [ ] lait\n', operation: cocherLait });
    expect(resultat.ok).toBe(false);
    expect(resultat.ok === false && resultat.raison).toBe('changee');
    expect(decouperPage(nas.contenu()['Courses/page.md']!).corps).toBe('- [ ] lait\n- [ ] œufs\n');
    expect(versTexte(await local.lireOctets('Courses/page.md'))).toContain('œufs');
    expect(nas.contenu()['Courses/.lock']).toBeUndefined();
  });

  it('échoue sans rien changer quand le NAS ne répond pas', async () => {
    const { nas, local, cache, contexte } = telephone({ 'Courses/page.md': page('- [ ] lait\n') });
    await cache.tirer();
    const avant = versTexte(await local.lireOctets('Courses/page.md'));
    nas.panne = true;
    await expect(modifierPageSurLeNas(contexte, 'Courses', { corpsAttendu: null, operation: cocherLait })).rejects.toBeInstanceOf(RemoteFsError);
    expect(versTexte(await local.lireOctets('Courses/page.md'))).toBe(avant);
  });

  it('n’écrit rien si l’opération ne change rien', async () => {
    const { nas, contexte } = telephone({ 'Courses/page.md': page('- [ ] lait\n') });
    const avant = nas.contenu();
    const resultat = await modifierPageSurLeNas(contexte, 'Courses', { corpsAttendu: null, operation: () => null });
    expect(resultat).toMatchObject({ ok: true, ecrit: false });
    expect(nas.contenu()).toEqual(avant);
  });

  it('garde le verrou d’une saisie en cours', async () => {
    const { nas, verrous, contexte } = telephone({ 'Courses/page.md': page('- [ ] lait\n') });
    expect((await verrous.prendre('Courses')).ok).toBe(true);
    await modifierPageSurLeNas(contexte, 'Courses', { corpsAttendu: null, operation: cocherLait });
    expect(nas.contenu()['Courses/.lock']).toContain('telephone');
  });

  it('change l’icône de la page sans toucher au corps', async () => {
    const { nas, contexte } = telephone({ 'Courses/page.md': page('- [ ] lait\n') });
    expect((await modifierPageSurLeNas(contexte, 'Courses', { corpsAttendu: null, operation: () => null, meta: { icone: '🛒' } })).ok).toBe(true);
    const texte = nas.contenu()['Courses/page.md']!;
    expect(texte).toContain('icon: 🛒');
    expect(decouperPage(texte).corps).toBe('- [ ] lait\n');
    expect(nas.contenu()['Courses/.lock']).toBeUndefined();
  });

  it('dit qu’une page a disparu du NAS', async () => {
    const { contexte } = telephone({});
    expect(await modifierPageSurLeNas(contexte, 'Courses', { corpsAttendu: null, operation: cocherLait })).toEqual({ ok: false, raison: 'introuvable' });
  });

  it('la tâche cochée sur le téléphone arrive sur le desktop au cycle suivant', async () => {
    const nas = new MemoryRemoteFs();
    const poste = MemoryLocalFs.depuis({ 'Courses/page.md': page('- [ ] lait\n') });
    const index = new MemoryIndexStore();
    const cycle = () => synchroniser({ local: poste, distant: nas, index, cle: 'vault', maintenant: () => instant, appareil: 'poste' });
    await cycle();
    const { contexte } = telephone({});
    const surLeTelephone = { ...contexte, distant: nas, verrous: new LockManager(nas, { appareil: 'telephone', nom: 'téléphone', pid: 0 }, () => instant) };
    await modifierPageSurLeNas(surLeTelephone, 'Courses', { corpsAttendu: null, operation: cocherLait });
    const rapport = await cycle();
    expect(rapport.tires).toEqual(['Courses/page.md']);
    expect(decouperPage(poste.contenu()['Courses/page.md']!).corps).toBe('- [x] lait\n');
  });
});

describe('creerPageSurLeNas', () => {
  it('crée la page et l’ordre du parent sur le NAS, puis dans le cache', async () => {
    const { nas, local, contexte } = telephone({ 'Maison/page.md': page(''), 'Maison/.order': '' });
    const creee = await creerPageSurLeNas(contexte, { parent: 'Maison', titre: 'Bricolage', modeListe: true });
    expect(creee.chemin).toBe('Maison/Bricolage');
    const texte = nas.contenu()['Maison/Bricolage/page.md']!;
    expect(texte).toContain('title: Bricolage');
    expect(texte).toContain('mode: todo');
    expect(nas.contenu()['Maison/.order']).toContain(creee.id);
    expect(versTexte(await local.lireOctets('Maison/Bricolage/page.md'))).toBe(texte);
    expect(versTexte(await local.lireOctets('Maison/.order'))).toContain(creee.id);
  });

  it('garde l’ordre du NAS et celui du cache, la nouvelle en dernier, sans ouvrir les pages sœurs sur le NAS', async () => {
    const id = (n: number) => `0199a0b0-0000-7000-8000-00000000000${n}`;
    const sœur = (n: number) => `---\nid: ${id(n)}\ntitle: Sœur ${n}\n---\n`;
    const { nas, cache, contexte } = telephone({ 'A/page.md': sœur(1), 'B/page.md': sœur(2), '.order': `${id(2)}\n` });
    await cache.tirer();
    // Une sœur que le cache ne connaît pas encore, rangée sur le NAS.
    nas.poser('C/page.md', sœur(3));
    nas.poser('.order', `${id(2)}\n${id(3)}\n`);
    const lus: string[] = [];
    nas.avantOperation = (operation, chemin) => {
      if (operation === 'lire') {
        lus.push(chemin);
      }
    };
    const creee = await creerPageSurLeNas(contexte, { parent: '', titre: 'Nouvelle', modeListe: false });
    expect(nas.contenu()['.order']).toBe(`${id(2)}\n${id(3)}\n${id(1)}\n${creee.id}\n`);
    expect(lus).toEqual(['.order']);
  });

  it('crée la page avec ce qui y a été écrit pendant qu’elle attendait le NAS', async () => {
    const { nas, contexte } = telephone({});
    const creee = await creerPageSurLeNas(contexte, { parent: '', titre: 'Courses', modeListe: true, corps: '- [ ] Pain\n- [ ] Lait\n' });
    const texte = nas.contenu()[`${creee.chemin}/page.md`]!;
    expect(texte).toContain('mode: todo');
    expect(texte.endsWith('---\n- [ ] Pain\n- [ ] Lait\n')).toBe(true);
  });

  it('refuse un titre vide ou un parent disparu', async () => {
    const { contexte } = telephone({});
    await expect(creerPageSurLeNas(contexte, { parent: '', titre: '  ', modeListe: false })).rejects.toMatchObject({ code: 'titre_invalide' });
    await expect(creerPageSurLeNas(contexte, { parent: 'Parti', titre: 'X', modeListe: false })).rejects.toMatchObject({ code: 'introuvable' });
  });

  it('crée une page classique à la racine', async () => {
    const { nas, contexte } = telephone({});
    const creee = await creerPageSurLeNas(contexte, { parent: '', titre: 'Idées', modeListe: false });
    expect(nas.contenu()[`${creee.chemin}/page.md`]).not.toContain('mode:');
    expect(nas.contenu()['.order']).toContain(creee.id);
  });
});
