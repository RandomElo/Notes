import { describe, expect, it } from 'vitest';
import { RemoteFsError } from '../fs/remote-fs';
import { MemoryLocalFs } from '../testing/memory-fs';
import { MemoryRemoteFs } from '../testing/memory-remote-fs';
import { envoyerMemosEnAttente, listerMemosEnAttente } from './memo-upload';

const ancien = 'memo-2026-10-11-080000.m4a';
const recent = 'memo-2026-10-11-091500.m4a';

describe('envoi des mémos du téléphone', () => {
  it('ne liste que les mémos enregistrés, non vides, du plus ancien au plus récent', async () => {
    const attente = MemoryLocalFs.depuis({
      [recent]: 'audio 2',
      [ancien]: 'audio 1',
      'memo-2026-10-11-100000.m4a': '',
      '.memo-2026-10-11-100000.m4a.ecriture.tmp': 'moitié',
      'autre.m4a': 'audio',
    });
    expect((await listerMemosEnAttente(attente)).map((memo) => memo.nom)).toEqual([ancien, recent]);
  });

  it('envoie chaque mémo dans .notes/memos/ puis le retire du téléphone', async () => {
    const attente = MemoryLocalFs.depuis({ [recent]: 'audio 2', [ancien]: 'audio 1' });
    const nas = new MemoryRemoteFs();
    const vus: string[] = [];
    expect(await envoyerMemosEnAttente(attente, nas, (nom) => vus.push(nom))).toEqual([ancien, recent]);
    expect(vus).toEqual([ancien, recent]);
    expect(nas.contenu()).toEqual({ [`.notes/memos/${ancien}`]: 'audio 1', [`.notes/memos/${recent}`]: 'audio 2' });
    expect(attente.contenu()).toEqual({});
  });

  it('ne fait rien sur le NAS sans mémo en attente', async () => {
    const nas = new MemoryRemoteFs();
    nas.panne = true;
    expect(await envoyerMemosEnAttente(new MemoryLocalFs(), nas)).toEqual([]);
  });

  it('garde les mémos sur le téléphone quand le NAS ne répond pas', async () => {
    const attente = MemoryLocalFs.depuis({ [ancien]: 'audio 1' });
    const nas = new MemoryRemoteFs();
    nas.panne = true;
    await expect(envoyerMemosEnAttente(attente, nas)).rejects.toBeInstanceOf(RemoteFsError);
    expect(attente.contenu()).toEqual({ [ancien]: 'audio 1' });
  });

  it('une coupure au milieu laisse les mémos pas encore envoyés pour la fois suivante', async () => {
    const attente = MemoryLocalFs.depuis({ [recent]: 'audio 2', [ancien]: 'audio 1' });
    const nas = new MemoryRemoteFs();
    nas.echouerSur = (operation, chemin) => operation === 'ecrire' && chemin.endsWith(recent);
    await expect(envoyerMemosEnAttente(attente, nas)).rejects.toThrow();
    expect(attente.contenu()).toEqual({ [recent]: 'audio 2' });
    nas.echouerSur = null;
    expect(await envoyerMemosEnAttente(attente, nas)).toEqual([recent]);
    expect(Object.keys(nas.contenu())).toEqual([`.notes/memos/${ancien}`, `.notes/memos/${recent}`]);
  });

  it('ne renvoie pas un mémo déjà sur le NAS dont la suppression locale avait échoué', async () => {
    const attente = MemoryLocalFs.depuis({ [ancien]: 'audio 1' });
    const nas = MemoryRemoteFs.depuis({ [`.notes/memos/${ancien}`]: 'audio 1' });
    await envoyerMemosEnAttente(attente, nas);
    expect(nas.ecritures).toBe(0);
    expect(attente.contenu()).toEqual({});
  });

  it("n'écrase jamais un fichier du même nom déjà sur le NAS", async () => {
    const attente = MemoryLocalFs.depuis({ [ancien]: 'audio du téléphone' });
    const nas = MemoryRemoteFs.depuis({ [`.notes/memos/${ancien}`]: 'autre' });
    await envoyerMemosEnAttente(attente, nas);
    expect(nas.contenu()).toEqual({ [`.notes/memos/${ancien}`]: 'autre' });
    expect(attente.contenu()).toEqual({});
  });

  it("ne s'arrête pas sur un mémo qu'un autre envoi a déjà retiré", async () => {
    const attente = MemoryLocalFs.depuis({ [recent]: 'audio 2', [ancien]: 'audio 1' });
    const nas = new MemoryRemoteFs();
    nas.avantOperation = (operation, chemin) => {
      if (operation === 'infos' && chemin.endsWith(ancien)) {
        // L'envoi d'Android passe au même moment.
        nas.poser(chemin, 'audio 1');
        void attente.supprimer(ancien);
      }
    };
    expect(await envoyerMemosEnAttente(attente, nas)).toEqual([ancien, recent]);
    expect(attente.contenu()).toEqual({});
  });
});
