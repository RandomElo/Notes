import { describe, expect, it } from 'vitest';
import { versOctets } from '../fs/utf8';
import { MemoryRemoteFs } from '../testing/memory-remote-fs';
import { LockManager, analyserVerrou, ecrireVerrou, etatDuVerrou, lireVerrou } from './lock';
import type { LocalPageState } from './lock';

const debut = Date.UTC(2026, 9, 3, 12, 0, 0);

function monter() {
  const nas = MemoryRemoteFs.depuis({ 'Alpha/page.md': 'a\n' });
  let instant = debut;
  const horloge = {
    maintenant: () => instant,
    avancer: (ms: number) => {
      instant += ms;
    },
  };
  const poste = new LockManager(nas, { appareil: 'poste', nom: 'pc-fixe', pid: 10 }, horloge.maintenant);
  const portable = new LockManager(nas, { appareil: 'portable', nom: 'portable', pid: 20 }, horloge.maintenant);
  return { nas, horloge, poste, portable };
}

describe('format du verrou', () => {
  it('se relit tel quel', () => {
    const verrou = { appareil: 'poste', nom: 'pc-fixe', pid: 42, heartbeat: debut };
    expect(analyserVerrou(ecrireVerrou(verrou))).toEqual(verrou);
  });

  it('refuse un contenu illisible', () => {
    expect(analyserVerrou(versOctets('pas du JSON'))).toBeNull();
    expect(analyserVerrou(versOctets('{"holder":"x"}'))).toBeNull();
  });

  it('distingue libre, à moi, autre vivant et périmé', () => {
    const autre = { appareil: 'autre', nom: 'téléphone', pid: 1, heartbeat: debut };
    expect(etatDuVerrou(null, 'moi', debut)).toEqual({ etat: 'libre' });
    expect(etatDuVerrou({ ...autre, appareil: 'moi' }, 'moi', debut)).toEqual({ etat: 'a_moi' });
    expect(etatDuVerrou(autre, 'moi', debut + 89_000)).toEqual({ etat: 'autre', nom: 'téléphone', heartbeat: debut });
    expect(etatDuVerrou(autre, 'moi', debut + 91_000)).toEqual({ etat: 'perime', nom: 'téléphone' });
    expect(etatDuVerrou('illisible', 'moi', debut)).toEqual({ etat: 'perime', nom: '' });
  });
});

describe('LockManager', () => {
  it('pose le verrou à la première frappe et refuse un autre appareil', async () => {
    const { nas, poste, portable } = monter();
    expect(await poste.prendre('Alpha')).toEqual({ ok: true });
    expect(nas.contenu()['Alpha/.lock']).toContain('"holder":"poste"');
    expect(await portable.prendre('Alpha')).toEqual({ ok: false, nom: 'pc-fixe' });
    expect(await portable.consulter('Alpha')).toMatchObject({ etat: 'autre', nom: 'pc-fixe' });
  });

  it('ne réécrit pas le verrou à chaque frappe', async () => {
    const { nas, poste } = monter();
    await poste.prendre('Alpha');
    const ecritures = nas.ecritures;
    await poste.prendre('Alpha');
    await poste.prendre('Alpha');
    expect(nas.ecritures).toBe(ecritures);
  });

  it('reprend un verrou périmé sans demander', async () => {
    const { horloge, poste, portable } = monter();
    await poste.prendre('Alpha');
    horloge.avancer(91_000);
    expect(await portable.prendre('Alpha')).toEqual({ ok: true });
  });

  it('force un verrou vivant à la demande, et l’autre appareil le voit perdu', async () => {
    const { poste, portable } = monter();
    await poste.prendre('Alpha');
    expect(await portable.prendre('Alpha', true)).toEqual({ ok: true });
    const entretien = await poste.entretenir(async () => 'en_attente');
    expect(entretien.perdues).toEqual([{ page: 'Alpha', nom: 'portable' }]);
    expect(poste.pagesTenues()).toEqual([]);
  });

  it('entretient le verrou tant qu’on écrit ou que la page n’est pas poussée', async () => {
    const { nas, horloge, poste, portable } = monter();
    let etat: LocalPageState = 'en_attente';
    await poste.prendre('Alpha');
    horloge.avancer(70_000);
    // Plus de frappe depuis 70 s, mais la page n'est pas encore sur le NAS : le verrou reste et revit.
    expect((await poste.entretenir(async () => etat)).relachees).toEqual([]);
    horloge.avancer(80_000);
    expect(await portable.consulter('Alpha')).toMatchObject({ etat: 'autre' });

    etat = 'poussee';
    expect((await poste.entretenir(async () => etat)).relachees).toEqual(['Alpha']);
    expect(nas.contenu()['Alpha/.lock']).toBeUndefined();
    expect(await portable.prendre('Alpha')).toEqual({ ok: true });
  });

  it('garde le verrou d’une page poussée tant que la dernière frappe a moins de 60 s', async () => {
    const { poste } = monter();
    await poste.prendre('Alpha');
    expect((await poste.entretenir(async () => 'poussee')).relachees).toEqual([]);
    expect(poste.pagesTenues()).toEqual(['Alpha']);
  });

  it('relâche aussitôt le verrou d’une page renommée, sans recréer son dossier', async () => {
    const { nas, poste } = monter();
    await poste.prendre('Alpha');
    nas.retirer('Alpha');
    expect((await poste.entretenir(async () => 'absente')).relachees).toEqual(['Alpha']);
    expect(nas.listeDesDossiers()).toEqual([]);
  });

  it('crée le dossier d’une page pas encore poussée pour y poser le verrou', async () => {
    const { nas, poste } = monter();
    await poste.prendre('Nouvelle');
    expect(await lireVerrou(nas, 'Nouvelle')).toMatchObject({ appareil: 'poste' });
  });

  it('ne retire pas le verrou d’un autre appareil', async () => {
    const { nas, poste, portable } = monter();
    await portable.prendre('Alpha');
    await poste.relacher('Alpha');
    expect(nas.contenu()['Alpha/.lock']).toContain('"holder":"portable"');
  });

  it('relâche tout à la fermeture, même si le NAS ne répond plus', async () => {
    const { nas, poste } = monter();
    await poste.prendre('Alpha');
    nas.panne = true;
    await expect(poste.toutRelacher()).resolves.toBeUndefined();
    expect(poste.pagesTenues()).toEqual([]);
  });
});
