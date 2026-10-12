import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { AiError, lignesDuFlux } from './chat';
import { decrireModeleOllama, discuterAvecOllama, listerModelesOllama, occupationOllama } from './ollama-client';
import { compterEntree, compterSortie } from './token-count';

type Traitement = (requete: IncomingMessage, corps: string, reponse: ServerResponse) => void;

const serveurs: Server[] = [];
afterEach(() => {
  for (const serveur of serveurs.splice(0)) {
    serveur.closeAllConnections();
    serveur.close();
  }
});

async function servir(traitement: Traitement): Promise<string> {
  const serveur = createServer((requete, reponse) => {
    let corps = '';
    requete.on('data', (morceau: Buffer) => (corps += morceau.toString('utf8')));
    requete.on('end', () => traitement(requete, corps, reponse));
  });
  serveurs.push(serveur);
  await new Promise<void>((resolve) => serveur.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(serveur.address() as AddressInfo).port}`;
}

const demande = (signal = new AbortController().signal) => ({ modele: 'm', systeme: 'Consigne.', texte: 'Texte.', signal });

describe('lecture en flux', () => {
  it('rend les lignes, même coupées entre deux morceaux', async () => {
    const encodeur = new TextEncoder();
    const flux = new ReadableStream<Uint8Array>({
      start(controleur) {
        controleur.enqueue(encodeur.encode('un\nde'));
        controleur.enqueue(encodeur.encode('ux\n\ntrois'));
        controleur.close();
      },
    });
    const lignes: string[] = [];
    for await (const ligne of lignesDuFlux(flux, new AbortController().signal)) {
      lignes.push(ligne);
    }
    expect(lignes).toEqual(['un', 'deux', 'trois']);
  });

  it('abandonne quand plus rien n’arrive', async () => {
    const flux = new ReadableStream<Uint8Array>({ start: () => undefined });
    const lire = async (): Promise<void> => {
      for await (const _ of lignesDuFlux(flux, new AbortController().signal, 30)) {
        // rien
      }
    };
    await expect(lire()).rejects.toMatchObject({ code: 'injoignable' });
  });
});

describe('Ollama', () => {
  it('liste les modèles installés, null si Ollama ne répond pas', async () => {
    const adresse = await servir((_, __, reponse) => reponse.end(JSON.stringify({ models: [{ name: 'qwen3:8b' }, { name: 'ministral-3:8b' }] })));
    expect((await listerModelesOllama(adresse))?.map((modele) => modele.nom)).toEqual(['ministral-3:8b', 'qwen3:8b']);
    expect(await listerModelesOllama('http://127.0.0.1:1')).toBeNull();
  });

  it('lit la réponse en flux et les comptes de tokens, sans réflexion demandée', async () => {
    let recu: Record<string, unknown> = {};
    const adresse = await servir((_, corps, reponse) => {
      recu = JSON.parse(corps) as Record<string, unknown>;
      reponse.write(`${JSON.stringify({ message: { content: 'Bon' }, done: false })}\n`);
      reponse.end(`${JSON.stringify({ message: { content: 'jour.' }, done: true, prompt_eval_count: 42, eval_count: 7 })}\n`);
    });
    const morceaux: string[] = [];
    const resultat = await discuterAvecOllama(adresse, { ...demande(), contexte: 8192, surMorceau: (texte) => morceaux.push(texte) });
    expect(resultat).toEqual({ texte: 'Bonjour.', entree: 42, sortie: 7, coupee: false });
    expect(morceaux).toEqual(['Bon', 'Bonjour.']);
    expect(recu).toMatchObject({ model: 'm', stream: true, think: false, options: { num_ctx: 8192 } });
  });

  it('borne la longueur de la réponse et dit quand elle a été coupée', async () => {
    let recu: Record<string, unknown> = {};
    const adresse = await servir((_, corps, reponse) => {
      recu = JSON.parse(corps) as Record<string, unknown>;
      reponse.end(`${JSON.stringify({ message: { content: 'Suite de couches' }, done: true, done_reason: 'length', eval_count: 4 })}\n`);
    });
    const resultat = await discuterAvecOllama(adresse, { ...demande(), sortieMax: 4 });
    expect(resultat.coupee).toBe(true);
    expect(recu).toMatchObject({ options: { num_predict: 4 } });
  });

  it('redemande sans `think` à un modèle qui ne réfléchit pas', async () => {
    const adresse = await servir((_, corps, reponse) => {
      if ('think' in (JSON.parse(corps) as object)) {
        reponse.statusCode = 400;
        reponse.end(JSON.stringify({ error: '"m" does not support thinking' }));
        return;
      }
      reponse.end(`${JSON.stringify({ message: { content: 'ok' }, done: true, prompt_eval_count: 1, eval_count: 1 })}\n`);
    });
    expect((await discuterAvecOllama(adresse, demande())).texte).toBe('ok');
  });

  it('dit qu’un modèle n’est pas installé, ou qu’Ollama ne répond pas', async () => {
    const adresse = await servir((_, __, reponse) => {
      reponse.statusCode = 404;
      reponse.end(JSON.stringify({ error: 'model "m" not found' }));
    });
    await expect(discuterAvecOllama(adresse, demande())).rejects.toMatchObject({ code: 'modele_absent' });
    await expect(discuterAvecOllama('http://127.0.0.1:1', demande())).rejects.toMatchObject({ code: 'injoignable' });
  });

  it('s’arrête sur une annulation', async () => {
    const adresse = await servir((_, __, reponse) => reponse.write(`${JSON.stringify({ message: { content: 'début' }, done: false })}\n`));
    const controleur = new AbortController();
    const appel = discuterAvecOllama(adresse, { ...demande(controleur.signal), surMorceau: () => controleur.abort() });
    await expect(appel).rejects.toBeInstanceOf(AiError);
    await expect(appel).rejects.toMatchObject({ code: 'annule' });
  });
});

describe('Ollama : modèles et mémoire vidéo', () => {
  it('lit la taille, les paramètres, l’architecture et la place en mémoire vidéo', async () => {
    const adresse = await servir((requete, _, reponse) => {
      if (requete.url === '/api/tags') {
        reponse.end(JSON.stringify({ models: [{ name: 'qwen3:8b', size: 5_200_000_000, details: { parameter_size: '8.2B', family: 'qwen3' } }] }));
      } else if (requete.url === '/api/show') {
        reponse.end(JSON.stringify({ model_info: { 'general.architecture': 'qwen3', 'qwen3.block_count': 36 } }));
      } else {
        reponse.end(JSON.stringify({ models: [{ name: 'gemma3:12b', size: 8_953_480_630, size_vram: 6_137_252_413 }] }));
      }
    });
    expect(await listerModelesOllama(adresse)).toEqual([{ nom: 'qwen3:8b', taille: 5_200_000_000, parametres: '8.2B', famille: 'qwen3' }]);
    expect(await decrireModeleOllama(adresse, 'qwen3:8b')).toEqual({ 'general.architecture': 'qwen3', 'qwen3.block_count': 36 });
    expect(await occupationOllama(adresse)).toEqual([{ nom: 'gemma3:12b', taille: 8_953_480_630, enVram: 6_137_252_413 }]);
  });
});

describe('comptage', () => {
  it('compte les tokens d’après la longueur du texte, enveloppe comprise', () => {
    expect(compterEntree('x'.repeat(36), 'y'.repeat(36))).toBe(20 + 11);
    expect(compterSortie('z'.repeat(36))).toBe(10);
  });
});
