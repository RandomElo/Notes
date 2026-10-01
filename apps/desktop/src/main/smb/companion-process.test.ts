import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { RemoteFsError } from '@notes/core';
import { describe, expect, it, vi } from 'vitest';
import { CompanionProcess } from './companion-process';
import type { CompanionChild } from './companion-process';

/** Faux compagnon : on lit ce que le main lui écrit et on répond à la main. */
class FauxEnfant extends EventEmitter implements CompanionChild {
  stdin = new PassThrough();
  stdout = new PassThrough();
  tue = false;
  recu: Record<string, unknown>[] = [];

  constructor() {
    super();
    this.stdin.setEncoding('utf8');
    this.stdin.on('data', (morceau: string) => {
      for (const ligne of morceau.split('\n').filter((l) => l !== '')) {
        this.recu.push(JSON.parse(ligne) as Record<string, unknown>);
      }
    });
    this.stdin.on('end', () => this.emit('exit'));
  }

  repondre(texte: string): void {
    this.stdout.write(texte);
  }

  kill(): void {
    this.tue = true;
  }
}

const tick = () => new Promise((resoudre) => setImmediate(resoudre));

function monter() {
  const enfants: FauxEnfant[] = [];
  const processus = new CompanionProcess(() => {
    const enfant = new FauxEnfant();
    enfants.push(enfant);
    return enfant;
  });
  return { processus, enfants };
}

describe('CompanionProcess', () => {
  it('associe chaque réponse à sa requête, même dans le désordre et en morceaux', async () => {
    const { processus, enfants } = monter();
    const premiere = processus.envoyer({ op: 'lire', chemin: 'a' });
    const seconde = processus.envoyer({ op: 'lire', chemin: 'b' });
    await tick();
    const enfant = enfants[0]!;
    expect(enfant.recu.map((requete) => requete['chemin'])).toEqual(['a', 'b']);

    enfant.repondre('{"id":2,"ok":true,"resultat":{"contenu":"Qg=="}}\n{"id":1,"ok":tr');
    enfant.repondre('ue,"resultat":{"contenu":"QQ=="}}\n');
    expect(await premiere).toEqual({ contenu: 'QQ==' });
    expect(await seconde).toEqual({ contenu: 'Qg==' });
    expect(enfants).toHaveLength(1);
  });

  it('transforme une réponse en échec en RemoteFsError avec un code connu', async () => {
    const { processus, enfants } = monter();
    const requete = processus.envoyer({ op: 'lire', chemin: 'absent' });
    await tick();
    enfants[0]!.repondre('{"id":1,"ok":false,"erreur":{"code":"introuvable","message":"introuvable"}}\n');
    await expect(requete).rejects.toMatchObject({ name: 'RemoteFsError', code: 'introuvable' });

    const inconnue = processus.envoyer({ op: 'ping' });
    await tick();
    enfants[0]!.repondre('{"id":2,"ok":false,"erreur":{"code":"code_inconnu","message":"?"}}\n');
    await expect(inconnue).rejects.toMatchObject({ code: 'interne' });
  });

  it("rejette les requêtes en attente et prévient quand le compagnon s'arrête, puis le relance", async () => {
    const { processus, enfants } = monter();
    const arrets = vi.fn();
    processus.surArret(arrets);

    const perdue = processus.envoyer({ op: 'ping' });
    await tick();
    enfants[0]!.emit('exit');
    await expect(perdue).rejects.toBeInstanceOf(RemoteFsError);
    expect(arrets).toHaveBeenCalledTimes(1);

    const suivante = processus.envoyer({ op: 'ping' });
    await tick();
    expect(enfants).toHaveLength(2);
    enfants[1]!.repondre('{"id":2,"ok":true}\n');
    expect(await suivante).toBeNull();
  });

  it('abandonne une requête sans réponse et repart sur un processus neuf', async () => {
    const { processus, enfants } = monter();
    await expect(processus.envoyer({ op: 'ping' }, 20)).rejects.toMatchObject({ code: 'injoignable' });
    await processus.envoyer({ op: 'ping' }, 20).catch(() => undefined);
    expect(enfants).toHaveLength(2);
  });

  it("signale un compagnon qui ne démarre pas sans laisser fuir l'erreur d'origine", async () => {
    const processus = new CompanionProcess(() => {
      throw new Error('ENOENT /chemin/secret');
    });
    await expect(processus.envoyer({ op: 'ping' })).rejects.toMatchObject({ code: 'interne' });
  });

  it('ferme l’entrée du compagnon à l’arrêt', async () => {
    const { processus, enfants } = monter();
    void processus.envoyer({ op: 'ping' }).catch(() => undefined);
    await tick();
    processus.arreter();
    await tick();
    expect(enfants[0]!.stdin.writableEnded).toBe(true);
  });
});
