/**
 * Une conversation avec un modèle : une demande (consigne et texte), une
 * réponse lue en flux, annulable, et des erreurs dites en français.
 */

export interface ChatRequest {
  modele: string;
  /** Consigne système. */
  systeme: string;
  /** Texte de la page, blocs réservés remplacés par leurs repères. */
  texte: string;
  /** Taille de contexte à demander à un modèle local, en tokens. */
  contexte?: number;
  /** Longueur maximale de la réponse, en tokens (un modèle qui s'emballe s'arrête là). */
  sortieMax?: number;
  signal: AbortSignal;
  /** Appelé à chaque morceau reçu, avec tout le texte reçu jusque-là. */
  surMorceau?: (texteRecu: string) => void;
}

export interface ChatResult {
  texte: string;
  /** Tokens comptés par le fournisseur. */
  entree: number;
  sortie: number;
  /** Réponse arrêtée par `sortieMax`. */
  coupee?: boolean;
}

export type AiErrorCode = 'injoignable' | 'modele_absent' | 'cle' | 'quota' | 'trop_long' | 'reponse' | 'annule';

export class AiError extends Error {
  readonly code: AiErrorCode;

  constructor(code: AiErrorCode, message: string) {
    super(message);
    this.name = 'AiError';
    this.code = code;
  }
}

/** Délai maximal sans rien recevoir (chargement d'un modèle local compris). */
export const silenceMaxMs = 180_000;

/**
 * Lignes d'un corps de réponse lu en flux. Lève une erreur « injoignable »
 * si plus rien n'arrive pendant `silenceMaxMs`, et « annule » si la demande
 * est annulée.
 */
export async function* lignesDuFlux(corps: ReadableStream<Uint8Array>, signal: AbortSignal, silenceMs = silenceMaxMs): AsyncGenerator<string> {
  const lecteur = corps.getReader();
  const decodeur = new TextDecoder();
  let reste = '';
  try {
    for (;;) {
      let minuteur: ReturnType<typeof setTimeout> | undefined;
      const silence = new Promise<never>((_, rejeter) => {
        minuteur = setTimeout(() => rejeter(new AiError('injoignable', 'Le modèle ne répond plus.')), silenceMs);
      });
      let lu: Awaited<ReturnType<typeof lecteur.read>>;
      try {
        lu = await Promise.race([lecteur.read(), silence]);
      } finally {
        clearTimeout(minuteur);
      }
      if (signal.aborted) {
        throw new AiError('annule', 'Demande annulée.');
      }
      if (lu.done) {
        break;
      }
      reste += decodeur.decode(lu.value, { stream: true });
      const lignes = reste.split('\n');
      reste = lignes.pop() ?? '';
      for (const ligne of lignes) {
        if (ligne.trim() !== '') {
          yield ligne.trim();
        }
      }
    }
    reste += decodeur.decode();
    if (reste.trim() !== '') {
      yield reste.trim();
    }
  } finally {
    void lecteur.cancel().catch(() => undefined);
  }
}

/** Erreur d'un appel `fetch` traduite : annulation ou serveur injoignable. */
export function erreurDeConnexion(erreur: unknown, signal: AbortSignal, service: string): AiError {
  if (erreur instanceof AiError) {
    return erreur;
  }
  if (signal.aborted) {
    return new AiError('annule', 'Demande annulée.');
  }
  return new AiError('injoignable', `${service} ne répond pas.`);
}
