import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageSaveResult } from '../../../../shared/ipc-contract';
import { PageSaver } from './page-saver';
import type { SaveState } from './page-saver';

const reussite: PageSaveResult = { ok: true, ecrit: true, conflit: null };

function monter(enregistrer: (corps: string, corpsDeBase: string) => Promise<PageSaveResult> = async () => reussite) {
  const page = { corps: 'départ' };
  const etats: SaveState['genre'][] = [];
  const appels: [string, string][] = [];
  const enregistres: [string, string | null][] = [];
  const saver = new PageSaver({
    corpsDeBase: 'départ',
    delaiMs: 800,
    delaiDeRepriseMs: 5000,
    lireCorps: () => page.corps,
    enregistrer: (corps, base) => {
      appels.push([corps, base]);
      return enregistrer(corps, base);
    },
    surEtat: (etat) => etats.push(etat.genre),
    surEnregistre: (corps, conflit) => enregistres.push([corps, conflit]),
  });
  const taper = (corps: string): void => {
    page.corps = corps;
    saver.signalerModification();
  };
  return { saver, taper, etats, appels, enregistres };
}

describe('PageSaver', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('attend une pause dans la frappe, puis enregistre une seule fois', async () => {
    const { saver, taper, appels, etats } = monter();
    taper('a');
    await vi.advanceTimersByTimeAsync(500);
    taper('ab');
    await vi.advanceTimersByTimeAsync(799);
    expect(appels).toEqual([]);
    expect(saver.aDesModifications()).toBe(true);

    await vi.advanceTimersByTimeAsync(1);
    expect(appels).toEqual([['ab', 'départ']]);
    expect(saver.aDesModifications()).toBe(false);
    expect(saver.base).toBe('ab');
    expect(etats).toEqual(['modifie', 'modifie', 'enregistrement', 'enregistre']);
  });

  it('n’enregistre rien si la page est revenue à son état de départ', async () => {
    const { taper, appels, etats } = monter();
    taper('a');
    taper('départ');
    await vi.advanceTimersByTimeAsync(800);
    expect(appels).toEqual([]);
    expect(etats.at(-1)).toBe('enregistre');
  });

  it('ne lance qu’une écriture à la fois et reprend ce qui a changé pendant', async () => {
    let finir = (_resultat: PageSaveResult): void => undefined;
    const { taper, appels, saver } = monter(() => new Promise((resoudre) => (finir = resoudre)));
    taper('a');
    await vi.advanceTimersByTimeAsync(800);
    taper('ab');
    await vi.advanceTimersByTimeAsync(800);
    // La première écriture n'est pas finie : la seconde attend.
    expect(appels).toEqual([['a', 'départ']]);

    finir(reussite);
    await vi.advanceTimersByTimeAsync(800);
    expect(appels).toEqual([['a', 'départ'], ['ab', 'a']]);
    finir(reussite);
    await vi.advanceTimersByTimeAsync(0);
    expect(saver.aDesModifications()).toBe(false);
  });

  it('enregistre tout de suite quand on le lui demande, avec le corps lu à cet instant', async () => {
    const { saver, taper, appels } = monter();
    taper('a');
    const vidage = saver.vider();
    // L'éditeur est détruit juste après : ce qu'il contiendrait ensuite ne compte plus.
    taper('ne doit pas être lu');
    saver.arreter();
    await vidage;
    expect(appels[0]).toEqual(['a', 'départ']);
  });

  it('attend l’écriture en cours avant d’enregistrer le reste', async () => {
    let finir = (_resultat: PageSaveResult): void => undefined;
    const { saver, taper, appels } = monter(() => new Promise((resoudre) => (finir = resoudre)));
    taper('a');
    await vi.advanceTimersByTimeAsync(800);
    taper('ab');
    const vidage = saver.vider();
    finir(reussite);
    await vi.advanceTimersByTimeAsync(0);
    expect(appels).toEqual([['a', 'départ'], ['ab', 'a']]);
    finir(reussite);
    await vidage;
    expect(saver.aDesModifications()).toBe(false);
  });

  it('ne fait rien au vidage s’il n’y a rien à enregistrer', async () => {
    const { saver, appels } = monter();
    await saver.vider();
    expect(appels).toEqual([]);
  });

  it('garde la page à enregistrer après un échec, le signale et réessaie', async () => {
    let echouer = true;
    const { saver, taper, appels, etats } = monter(async () =>
      echouer ? { ok: false, erreur: { code: 'interne', message: 'Disque plein.' } } : reussite,
    );
    taper('a');
    await vi.advanceTimersByTimeAsync(800);
    expect(etats.at(-1)).toBe('erreur');
    expect(saver.aDesModifications()).toBe(true);
    expect(saver.base).toBe('départ');

    echouer = false;
    await vi.advanceTimersByTimeAsync(5000);
    expect(appels).toEqual([['a', 'départ'], ['a', 'départ']]);
    expect(etats.at(-1)).toBe('enregistre');
  });

  it('traite une promesse rejetée comme un échec', async () => {
    const { taper, etats } = monter(() => Promise.reject(new Error('canal fermé')));
    taper('a');
    await vi.advanceTimersByTimeAsync(800);
    expect(etats.at(-1)).toBe('erreur');
  });

  it('transmet le nom de la sauvegarde de conflit', async () => {
    const { taper, enregistres } = monter(async () => ({ ok: true, ecrit: true, conflit: 'page.conflit-2026-10-02-140503.md' }));
    taper('a');
    await vi.advanceTimersByTimeAsync(800);
    expect(enregistres).toEqual([['a', 'page.conflit-2026-10-02-140503.md']]);
  });

  it('part de la nouvelle base après un rechargement depuis le disque', async () => {
    const { saver, taper, appels } = monter();
    saver.remplacerBase('rechargé');
    taper('rechargé et modifié');
    await vi.advanceTimersByTimeAsync(800);
    expect(appels).toEqual([['rechargé et modifié', 'rechargé']]);
  });

  it('ne planifie plus rien une fois arrêté', async () => {
    const { saver, taper, appels } = monter();
    saver.arreter();
    taper('a');
    await vi.advanceTimersByTimeAsync(5000);
    expect(appels).toEqual([]);
  });
});
