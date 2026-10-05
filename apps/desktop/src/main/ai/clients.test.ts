import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { AiError, lignesDuFlux } from './chat';
import { discuterAvecOllama, listerModelesOllama } from './ollama-client';
import { adresseDeLApi, discuterAvecOpenAi, estModeleDeTexte, listerModelesOpenAi } from './openai-client';
import { coutEnDollars, tarifDuModele } from './openai-prices';
import { compterEntree, tokensOpenAi } from './token-count';

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
    expect(await listerModelesOllama(adresse)).toEqual(['ministral-3:8b', 'qwen3:8b']);
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
    expect(resultat).toEqual({ texte: 'Bonjour.', entree: 42, sortie: 7 });
    expect(morceaux).toEqual(['Bon', 'Bonjour.']);
    expect(recu).toMatchObject({ model: 'm', stream: true, think: false, options: { num_ctx: 8192 } });
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

describe('OpenAI', () => {
  const evenement = (donnees: unknown): string => `data: ${JSON.stringify(donnees)}\n\n`;

  it('lit la réponse en flux et l’usage final, avec la clé dans l’en-tête', async () => {
    let autorisation = '';
    let recu: Record<string, unknown> = {};
    const adresse = await servir((requete, corps, reponse) => {
      autorisation = requete.headers.authorization ?? '';
      recu = JSON.parse(corps) as Record<string, unknown>;
      reponse.write(evenement({ choices: [{ delta: { content: 'Bon' } }] }));
      reponse.write(evenement({ choices: [{ delta: { content: 'jour.' } }] }));
      reponse.write(evenement({ choices: [], usage: { prompt_tokens: 30, completion_tokens: 3 } }));
      reponse.end('data: [DONE]\n\n');
    });
    expect(await discuterAvecOpenAi('sk-test', { ...demande(), modele: 'gpt-4.1-mini' }, adresse)).toEqual({ texte: 'Bonjour.', entree: 30, sortie: 3 });
    expect(autorisation).toBe('Bearer sk-test');
    expect(recu).toMatchObject({ model: 'gpt-4.1-mini', stream: true, stream_options: { include_usage: true } });
    expect(recu).not.toHaveProperty('reasoning_effort');
  });

  it('demande le moins de raisonnement que le modèle accepte', async () => {
    const efforts: unknown[] = [];
    const adresse = await servir((_, corps, reponse) => {
      const effort = (JSON.parse(corps) as { reasoning_effort?: unknown }).reasoning_effort;
      efforts.push(effort);
      if (effort === 'none') {
        reponse.statusCode = 400;
        reponse.end(JSON.stringify({ error: { message: "Unsupported value: 'none'", param: 'reasoning_effort' } }));
        return;
      }
      reponse.end(`${evenement({ choices: [], usage: { prompt_tokens: 1, completion_tokens: 1 } })}data: [DONE]\n\n`);
    });
    await discuterAvecOpenAi('sk-test', { ...demande(), modele: 'gpt-5-mini' }, adresse);
    await discuterAvecOpenAi('sk-test', { ...demande(), modele: 'gpt-5-mini' }, adresse);
    expect(efforts).toEqual(['none', 'minimal', 'minimal']);
  });

  it('traduit les erreurs sans jamais montrer la clé', async () => {
    const statuts: Array<[number, unknown, string]> = [
      [401, { error: { message: 'Incorrect API key provided: sk-secret' } }, 'cle'],
      [429, { error: { code: 'insufficient_quota' } }, 'quota'],
      [404, { error: { code: 'model_not_found' } }, 'modele_absent'],
      [400, { error: { code: 'context_length_exceeded' } }, 'trop_long'],
    ];
    for (const [statut, corps, code] of statuts) {
      const adresse = await servir((_, __, reponse) => {
        reponse.statusCode = statut;
        reponse.end(JSON.stringify(corps));
      });
      const erreur = (await discuterAvecOpenAi('sk-secret', { ...demande(), modele: 'gpt-4.1' }, adresse).catch((e: unknown) => e)) as AiError;
      expect(erreur.code).toBe(code);
      expect(erreur.message).not.toContain('sk-secret');
    }
  });

  it('liste les modèles de texte du compte', async () => {
    const adresse = await servir((_, __, reponse) => reponse.end(JSON.stringify({ data: [{ id: 'gpt-5.4-mini' }, { id: 'gpt-4o-audio-preview' }, { id: 'text-embedding-3-small' }, { id: 'gpt-4.1' }] })));
    expect(await listerModelesOpenAi('sk-test', adresse)).toEqual(['gpt-4.1', 'gpt-5.4-mini']);
    expect(estModeleDeTexte('gpt-realtime')).toBe(false);
  });

  it('ne laisse remplacer l’adresse de l’API que par une adresse du poste', () => {
    expect(adresseDeLApi({})).toBe('https://api.openai.com');
    expect(adresseDeLApi({ NOTES_OPENAI_ADRESSE: 'http://127.0.0.1:8123' })).toBe('http://127.0.0.1:8123');
    expect(adresseDeLApi({ NOTES_OPENAI_ADRESSE: 'https://exemple.com' })).toBe('https://api.openai.com');
  });
});

describe('tarifs et comptage', () => {
  it('prend le tarif saisi avant celui de Notes, et celui du modèle pour un nom daté', () => {
    expect(tarifDuModele('gpt-5.4-mini', {})).toEqual({ entree: 0.75, sortie: 4.5 });
    expect(tarifDuModele('gpt-5.4-mini-2026-03-17', {})).toEqual({ entree: 0.75, sortie: 4.5 });
    expect(tarifDuModele('gpt-5.4-mini', { 'gpt-5.4-mini': { entree: 1, sortie: 2 } })).toEqual({ entree: 1, sortie: 2 });
    expect(tarifDuModele('gpt-inconnu', {})).toBeNull();
    expect(coutEnDollars({ entree: 0.75, sortie: 4.5 }, 2000, 1000)).toBeCloseTo(0.006);
  });

  it('compte les tokens d’OpenAI localement, enveloppe comprise', async () => {
    expect(await tokensOpenAi('Bonjour, voici une phrase en français à compter.')).toBe(10);
    expect(await compterEntree('openai', 'Consigne.', 'Texte.')).toBe((await tokensOpenAi('Consigne.')) + (await tokensOpenAi('Texte.')) + 11);
    expect(await compterEntree('ollama', 'x'.repeat(36), 'y'.repeat(36))).toBe(20 + 11);
  });
});
