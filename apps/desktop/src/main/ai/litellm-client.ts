import type { AiPrice } from '@notes/core';
import { AiError, erreurDeConnexion, lignesDuFlux } from './chat';
import type { ChatRequest, ChatResult } from './chat';

/**
 * Client de LiteLLM (README §12, choix d'Eloi du 2026-10-05), le proxy par
 * lequel Eloi parle aux modèles payants. Son API est celle d'OpenAI
 * (`/v1/models`, `/v1/chat/completions`) ; il dit en plus le tarif de chaque
 * modèle (`/model/info`). La clé ne sert qu'ici, dans un en-tête, vers
 * l'adresse réglée ; elle n'apparaît dans aucun message d'erreur.
 */

export interface ApiModel {
  nom: string;
  /** Tarif donné par LiteLLM, en dollars par million de tokens ; null s'il ne le donne pas. */
  tarif: AiPrice | null;
}

const delaiDeListeMs = 8000;

/** Modèles d'embedding, d'audio, d'image, de recherche : rien à faire dans une relecture. */
export function estModeleDeTexte(id: string): boolean {
  return !/(embed|whisper|tts|transcribe|audio|realtime|image|dall-e|rerank|moderation|search|computer)/i.test(id);
}

async function lireJson(adresse: string, chemin: string, cle: string): Promise<unknown> {
  const reponse = await fetch(`${adresse}${chemin}`, { headers: { Authorization: `Bearer ${cle}` }, signal: AbortSignal.timeout(delaiDeListeMs) });
  return reponse.ok ? reponse.json() : null;
}

/** Tarifs par modèle d'après `/model/info` (coût par token, ramené au million). */
function tarifsDeLitellm(corps: unknown): Map<string, { tarif: AiPrice | null; mode: string | null }> {
  const tarifs = new Map<string, { tarif: AiPrice | null; mode: string | null }>();
  const donnees = typeof corps === 'object' && corps !== null ? (corps as { data?: unknown }).data : null;
  if (!Array.isArray(donnees)) {
    return tarifs;
  }
  for (const entree of donnees as Array<{ model_name?: unknown; model_info?: { input_cost_per_token?: unknown; output_cost_per_token?: unknown; mode?: unknown } }>) {
    if (typeof entree.model_name !== 'string') {
      continue;
    }
    const info = entree.model_info ?? {};
    const entreeParToken = info.input_cost_per_token;
    const sortieParToken = info.output_cost_per_token;
    const tarif =
      typeof entreeParToken === 'number' && typeof sortieParToken === 'number' && entreeParToken >= 0 && sortieParToken >= 0
        ? { entree: entreeParToken * 1_000_000, sortie: sortieParToken * 1_000_000 }
        : null;
    tarifs.set(entree.model_name, { tarif, mode: typeof info.mode === 'string' ? info.mode : null });
  }
  return tarifs;
}

/** Modèles de conversation que la clé donne, avec leur tarif ; null si LiteLLM refuse la clé ou ne répond pas. */
export async function listerModelesLitellm(adresse: string, cle: string): Promise<ApiModel[] | null> {
  try {
    const modeles = (await lireJson(adresse, '/v1/models', cle)) as { data?: Array<{ id?: unknown }> } | null;
    if (modeles === null || !Array.isArray(modeles.data)) {
      return null;
    }
    // `/model/info` peut être refusé à une clé restreinte : sans lui, les tarifs viennent de Notes ou des réglages.
    const infos = tarifsDeLitellm(await lireJson(adresse, '/model/info', cle).catch(() => null));
    return modeles.data
      .map((modele) => modele.id)
      .filter((id): id is string => typeof id === 'string' && estModeleDeTexte(id))
      .filter((id) => {
        const mode = infos.get(id)?.mode;
        return mode === null || mode === undefined || mode === 'chat' || mode === 'responses';
      })
      .sort((a, b) => a.localeCompare(b))
      .map((nom) => ({ nom, tarif: infos.get(nom)?.tarif ?? null }));
  } catch {
    return null;
  }
}

/**
 * Effort de raisonnement demandé, du plus faible au moins faible : un
 * modèle qui raisonne compte sa réflexion dans la sortie, ce qui fausserait
 * l'estimation et coûterait sans rien apporter à une relecture. Le nom d'un
 * modèle chez LiteLLM ne dit pas s'il raisonne : on essaie, et la première
 * valeur acceptée est retenue pour la session (sans le paramètre en dernier).
 */
const effortsDeRaisonnement = ['none', 'minimal', 'low', null] as const;
const effortRetenu = new Map<string, string | null>();

interface ErreurDeLApi {
  message: string;
  code: string;
  parametre: string;
}

async function lireErreur(reponse: Response): Promise<ErreurDeLApi> {
  try {
    const corps = (await reponse.json()) as { error?: { message?: unknown; code?: unknown; param?: unknown; type?: unknown } };
    const erreur = corps.error ?? {};
    return {
      message: typeof erreur.message === 'string' ? erreur.message : '',
      code: typeof erreur.code === 'string' ? erreur.code : typeof erreur.type === 'string' ? erreur.type : '',
      parametre: typeof erreur.param === 'string' ? erreur.param : '',
    };
  } catch {
    return { message: '', code: '', parametre: '' };
  }
}

function envoyer(adresse: string, cle: string, demande: ChatRequest, effort: string | null): Promise<Response> {
  return fetch(`${adresse}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cle}` },
    signal: demande.signal,
    body: JSON.stringify({
      model: demande.modele,
      messages: [
        { role: 'system', content: demande.systeme },
        { role: 'user', content: demande.texte },
      ],
      stream: true,
      stream_options: { include_usage: true },
      ...(effort === null ? {} : { reasoning_effort: effort }),
    }),
  });
}

/** Erreur de l'API traduite en français, sans jamais reprendre la clé. */
function traduire(statut: number, erreur: ErreurDeLApi, modele: string): AiError {
  if (statut === 401 || statut === 403) {
    return new AiError('cle', "LiteLLM refuse la clé d'API. Vérifie-la dans les réglages.");
  }
  if (statut === 429) {
    return /budget|quota|insufficient/i.test(`${erreur.code} ${erreur.message}`)
      ? new AiError('quota', 'Le budget ou le crédit de la clé est épuisé.')
      : new AiError('quota', 'LiteLLM limite les demandes pour l’instant. Réessaie dans un moment.');
  }
  if (statut === 404 || erreur.code === 'model_not_found' || /model.*not.*(found|exist)|invalid model/i.test(erreur.message)) {
    return new AiError('modele_absent', `Le modèle « ${modele} » n'est pas disponible chez LiteLLM.`);
  }
  if (erreur.code === 'context_length_exceeded' || /context.?length|too long/i.test(erreur.message)) {
    return new AiError('trop_long', 'La page est trop longue pour ce modèle.');
  }
  return new AiError('reponse', `LiteLLM a répondu par une erreur (${statut}).`);
}

interface StreamChunk {
  choices?: Array<{ delta?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
}

export async function discuterAvecLitellm(adresse: string, cle: string, demande: ChatRequest): Promise<ChatResult> {
  let reponse: Response | null = null;
  try {
    const essais = effortRetenu.has(demande.modele) ? [effortRetenu.get(demande.modele)!] : effortsDeRaisonnement;
    for (const effort of essais) {
      reponse = await envoyer(adresse, cle, demande, effort);
      if (reponse.status === 400 && effort !== null) {
        const erreur = await lireErreur(reponse);
        if (erreur.parametre === 'reasoning_effort' || /reasoning/i.test(erreur.message)) {
          continue;
        }
        throw traduire(400, erreur, demande.modele);
      }
      if (reponse.ok) {
        effortRetenu.set(demande.modele, effort);
      }
      break;
    }
  } catch (erreur) {
    throw erreurDeConnexion(erreur, demande.signal, 'LiteLLM');
  }
  if (reponse === null || !reponse.ok || reponse.body === null) {
    throw traduire(reponse?.status ?? 0, reponse === null ? { message: '', code: '', parametre: '' } : await lireErreur(reponse), demande.modele);
  }

  let texte = '';
  let entree = 0;
  let sortie = 0;
  try {
    for await (const ligne of lignesDuFlux(reponse.body, demande.signal)) {
      if (!ligne.startsWith('data:')) {
        continue;
      }
      const donnees = ligne.slice(5).trim();
      if (donnees === '[DONE]') {
        break;
      }
      let morceau: StreamChunk;
      try {
        morceau = JSON.parse(donnees) as StreamChunk;
      } catch {
        continue;
      }
      const contenu = morceau.choices?.[0]?.delta?.content;
      if (typeof contenu === 'string' && contenu !== '') {
        texte += contenu;
        demande.surMorceau?.(texte);
      }
      if (morceau.usage) {
        entree = morceau.usage.prompt_tokens ?? 0;
        sortie = morceau.usage.completion_tokens ?? 0;
      }
    }
  } catch (erreur) {
    throw erreurDeConnexion(erreur, demande.signal, 'LiteLLM');
  }
  return { texte, entree, sortie };
}
