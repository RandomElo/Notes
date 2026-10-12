import { AiError, erreurDeConnexion, lignesDuFlux } from './chat';
import type { ChatRequest, ChatResult } from './chat';

/**
 * Client d'Ollama (docs/spec/ia.md), servi sur le poste par le service systemd
 * qu'installe son script officiel. API documentée : `/api/tags` pour les
 * modèles installés, `/api/show` pour leur architecture, `/api/ps` pour leur
 * place en mémoire vidéo, `/api/chat` en flux NDJSON.
 */

const delaiDeListeMs = 3000;

export interface InstalledModel {
  nom: string;
  /** Taille sur le disque, en octets. */
  taille: number;
  /** « 8.2B », tel qu'Ollama l'écrit. */
  parametres: string | null;
  famille: string;
}

/** Modèles installés, ou null si Ollama ne répond pas. */
export async function listerModelesOllama(adresse: string): Promise<InstalledModel[] | null> {
  try {
    const reponse = await fetch(`${adresse}/api/tags`, { signal: AbortSignal.timeout(delaiDeListeMs) });
    if (!reponse.ok) {
      return null;
    }
    const corps = (await reponse.json()) as { models?: Array<{ name?: unknown; size?: unknown; details?: { parameter_size?: unknown; family?: unknown } }> };
    return (corps.models ?? [])
      .filter((modele): modele is { name: string; size?: unknown; details?: { parameter_size?: unknown; family?: unknown } } => typeof modele.name === 'string')
      .map((modele) => ({
        nom: modele.name,
        taille: typeof modele.size === 'number' ? modele.size : 0,
        parametres: typeof modele.details?.parameter_size === 'string' ? modele.details.parameter_size : null,
        famille: typeof modele.details?.family === 'string' ? modele.details.family : '',
      }))
      .sort((a, b) => a.nom.localeCompare(b.nom));
  } catch {
    return null;
  }
}

/** Architecture d'un modèle (`model_info` de `/api/show`), null si Ollama ne la donne pas. */
export async function decrireModeleOllama(adresse: string, nom: string): Promise<Record<string, unknown> | null> {
  try {
    const reponse = await fetch(`${adresse}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: nom }),
      signal: AbortSignal.timeout(delaiDeListeMs),
    });
    if (!reponse.ok) {
      return null;
    }
    const corps = (await reponse.json()) as { model_info?: unknown };
    return typeof corps.model_info === 'object' && corps.model_info !== null ? (corps.model_info as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Modèles chargés et la part de chacun en mémoire vidéo (`/api/ps`), null si Ollama ne répond pas. */
export async function occupationOllama(adresse: string): Promise<Array<{ nom: string; taille: number; enVram: number }> | null> {
  try {
    const reponse = await fetch(`${adresse}/api/ps`, { signal: AbortSignal.timeout(delaiDeListeMs) });
    if (!reponse.ok) {
      return null;
    }
    const corps = (await reponse.json()) as { models?: Array<{ name?: unknown; size?: unknown; size_vram?: unknown }> };
    return (corps.models ?? []).flatMap((modele) =>
      typeof modele.name === 'string' && typeof modele.size === 'number' && typeof modele.size_vram === 'number' ? [{ nom: modele.name, taille: modele.size, enVram: modele.size_vram }] : [],
    );
  } catch {
    return null;
  }
}

interface ChatChunk {
  message?: { content?: string };
  done?: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
  /** « length » quand `num_predict` a arrêté la réponse. */
  done_reason?: string;
  error?: string;
}

/** Message d'erreur d'Ollama, lu sans faire confiance au corps. */
async function messageDErreur(reponse: Response): Promise<string> {
  try {
    const corps = (await reponse.json()) as { error?: unknown };
    return typeof corps.error === 'string' ? corps.error : '';
  } catch {
    return '';
  }
}

function envoyer(adresse: string, demande: ChatRequest, sansReflexion: boolean): Promise<Response> {
  return fetch(`${adresse}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: demande.signal,
    body: JSON.stringify({
      model: demande.modele,
      messages: [
        { role: 'system', content: demande.systeme },
        { role: 'user', content: demande.texte },
      ],
      stream: true,
      // Les modèles qui réfléchissent avant de répondre (Qwen3) le font sinon dans la sortie, et en prennent le temps.
      ...(sansReflexion ? { think: false } : {}),
      options: {
        temperature: 0.3,
        ...(demande.contexte === undefined ? {} : { num_ctx: demande.contexte }),
        ...(demande.sortieMax === undefined ? {} : { num_predict: demande.sortieMax }),
      },
    }),
  });
}

export async function discuterAvecOllama(adresse: string, demande: ChatRequest): Promise<ChatResult> {
  let reponse: Response;
  try {
    reponse = await envoyer(adresse, demande, true);
    if (reponse.status === 400) {
      const message = await messageDErreur(reponse);
      // Un modèle qui ne sait pas réfléchir refuse `think` : on redemande sans.
      if (!/think/i.test(message)) {
        throw new AiError('reponse', `Ollama a refusé la demande : ${message.slice(0, 200)}`);
      }
      reponse = await envoyer(adresse, demande, false);
    }
  } catch (erreur) {
    throw erreurDeConnexion(erreur, demande.signal, 'Ollama');
  }
  if (reponse.status === 404) {
    throw new AiError('modele_absent', `Le modèle « ${demande.modele} » n'est pas installé dans Ollama.`);
  }
  if (!reponse.ok || reponse.body === null) {
    const message = await messageDErreur(reponse);
    throw new AiError('reponse', `Ollama a répondu par une erreur (${reponse.status})${message === '' ? '' : ` : ${message.slice(0, 200)}`}.`);
  }

  let texte = '';
  let entree = 0;
  let sortie = 0;
  let coupee = false;
  try {
    for await (const ligne of lignesDuFlux(reponse.body, demande.signal)) {
      let morceau: ChatChunk;
      try {
        morceau = JSON.parse(ligne) as ChatChunk;
      } catch {
        continue;
      }
      if (typeof morceau.error === 'string') {
        throw new AiError('reponse', `Ollama s'est arrêté : ${morceau.error.slice(0, 200)}`);
      }
      if (typeof morceau.message?.content === 'string' && morceau.message.content !== '') {
        texte += morceau.message.content;
        demande.surMorceau?.(texte);
      }
      if (morceau.done === true) {
        entree = morceau.prompt_eval_count ?? 0;
        sortie = morceau.eval_count ?? 0;
        coupee = morceau.done_reason === 'length';
      }
    }
  } catch (erreur) {
    throw erreurDeConnexion(erreur, demande.signal, 'Ollama');
  }
  return { texte, entree, sortie, coupee };
}
