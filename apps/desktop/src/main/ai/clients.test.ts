import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { AiError, lignesDuFlux } from './chat';
import { discuterAvecLitellm, estModeleDeTexte, listerModelesLitellm } from './litellm-client';
import { decrireModeleOllama, discuterAvecOllama, listerModelesOllama, occupationOllama } from './ollama-client';
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

describe('LiteLLM', () => {
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
    expect(await discuterAvecLitellm(adresse, 'sk-test', { ...demande(), modele: 'gpt-5.6-luna' })).toEqual({ texte: 'Bonjour.', entree: 30, sortie: 3 });
    expect(autorisation).toBe('Bearer sk-test');
    expect(recu).toMatchObject({ model: 'gpt-5.6-luna', stream: true, stream_options: { include_usage: true }, reasoning_effort: 'none' });
  });

  it('demande le moins de raisonnement que le modèle accepte, et s’en passe s’il le refuse', async () => {
    const efforts: unknown[] = [];
    const adresse = await servir((_, corps, reponse) => {
      const { model, reasoning_effort: effort } = JSON.parse(corps) as { model: string; reasoning_effort?: unknown };
      efforts.push(effort);
      const refuse = model === 'raisonne' ? effort === 'none' : effort !== undefined;
      if (refuse) {
        reponse.statusCode = 400;
        reponse.end(JSON.stringify({ error: { message: `UnsupportedParamsError: reasoning_effort=${String(effort)}` } }));
        return;
      }
      reponse.end(`${evenement({ choices: [], usage: { prompt_tokens: 1, completion_tokens: 1 } })}data: [DONE]\n\n`);
    });
    await discuterAvecLitellm(adresse, 'sk-test', { ...demande(), modele: 'raisonne' });
    await discuterAvecLitellm(adresse, 'sk-test', { ...demande(), modele: 'raisonne' });
    await discuterAvecLitellm(adresse, 'sk-test', { ...demande(), modele: 'classique' });
    expect(efforts).toEqual(['none', 'minimal', 'minimal', 'none', 'minimal', 'low', undefined]);
  });

  it('traduit les erreurs sans jamais montrer la clé', async () => {
    const statuts: Array<[number, unknown, string]> = [
      [401, { error: { message: 'Authentication Error, Invalid proxy server token passed. key=sk-secret' } }, 'cle'],
      [429, { error: { message: 'Budget has been exceeded' } }, 'quota'],
      [400, { error: { message: 'Invalid model name passed in model=inconnu' } }, 'modele_absent'],
      [400, { error: { code: 'context_length_exceeded' } }, 'trop_long'],
    ];
    for (const [statut, corps, code] of statuts) {
      const adresse = await servir((_, __, reponse) => {
        reponse.statusCode = statut;
        reponse.end(JSON.stringify(corps));
      });
      const erreur = (await discuterAvecLitellm(adresse, 'sk-secret', { ...demande(), modele: 'gpt-4.1' }).catch((e: unknown) => e)) as AiError;
      expect(erreur.code).toBe(code);
      expect(erreur.message).not.toContain('sk-secret');
    }
  });

  it('liste les modèles de conversation avec le tarif que donne LiteLLM', async () => {
    const adresse = await servir((requete, _, reponse) => {
      if (requete.url === '/model/info') {
        reponse.end(
          JSON.stringify({
            data: [
              { model_name: 'gpt-5.6-luna', model_info: { input_cost_per_token: 2e-7, output_cost_per_token: 1.2e-6, mode: 'chat' } },
              { model_name: 'nomic', model_info: { mode: 'embedding' } },
            ],
          }),
        );
        return;
      }
      reponse.end(JSON.stringify({ data: [{ id: 'gpt-5.6-luna' }, { id: 'nomic' }, { id: 'whisper-1' }, { id: 'mon-alias' }] }));
    });
    const modeles = await listerModelesLitellm(adresse, 'sk-test');
    expect(modeles?.map((modele) => modele.nom)).toEqual(['gpt-5.6-luna', 'mon-alias']);
    expect(modeles?.[0]?.tarif?.entree).toBeCloseTo(0.2);
    expect(modeles?.[0]?.tarif?.sortie).toBeCloseTo(1.2);
    expect(modeles?.[1]?.tarif).toBeNull();
    expect(await listerModelesLitellm('http://127.0.0.1:1', 'sk-test')).toBeNull();
    expect(estModeleDeTexte('text-embedding-3-small')).toBe(false);
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

describe('tarifs et comptage', () => {
  it('prend le tarif saisi, puis celui de LiteLLM, puis celui de Notes (nom préfixé ou daté compris)', () => {
    const luna = { entree: 0.2, sortie: 1.2 };
    expect(tarifDuModele('gpt-5.6-luna', {})).toEqual({ tarif: luna, source: 'notes' });
    expect(tarifDuModele('openai/gpt-5.4-mini-2026-03-17', {})).toEqual({ tarif: { entree: 0.75, sortie: 4.5 }, source: 'notes' });
    expect(tarifDuModele('mon-alias', {}, luna)).toEqual({ tarif: luna, source: 'litellm' });
    expect(tarifDuModele('mon-alias', { 'mon-alias': { entree: 1, sortie: 2 } }, luna)).toEqual({ tarif: { entree: 1, sortie: 2 }, source: 'reglages' });
    expect(tarifDuModele('gpt-inconnu', {})).toBeNull();
    expect(coutEnDollars({ entree: 0.75, sortie: 4.5 }, 2000, 1000)).toBeCloseTo(0.006);
  });

  it('compte les tokens des modèles d’OpenAI localement, enveloppe comprise', async () => {
    expect(await tokensOpenAi('Bonjour, voici une phrase en français à compter.')).toBe(10);
    expect(await compterEntree('litellm', 'Consigne.', 'Texte.')).toBe((await tokensOpenAi('Consigne.')) + (await tokensOpenAi('Texte.')) + 11);
    expect(await compterEntree('ollama', 'x'.repeat(36), 'y'.repeat(36))).toBe(20 + 11);
  });
});
