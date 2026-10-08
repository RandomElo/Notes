/**
 * Demande de transcription au serveur whisper.cpp (`/inference`) : un WAV
 * 16 kHz mono, déjà converti par la page, et la langue imposée (français).
 */

/** Plus long mémo accepté : une heure de WAV 16 kHz mono 16 bits. */
export const tailleMaxDUnWav = 16_000 * 2 * 3600 + 44;

export async function transcrireWav(adresse: string, wav: Uint8Array, signal?: AbortSignal): Promise<string> {
  const formulaire = new FormData();
  formulaire.append('file', new Blob([wav as Uint8Array<ArrayBuffer>], { type: 'audio/wav' }), 'memo.wav');
  formulaire.append('response_format', 'json');
  formulaire.append('language', 'fr');
  formulaire.append('temperature', '0');
  const reponse = await fetch(`${adresse}/inference`, { method: 'POST', body: formulaire, ...(signal === undefined ? {} : { signal }) });
  const corps = (await reponse.json().catch(() => null)) as { text?: unknown; error?: unknown } | null;
  if (!reponse.ok || corps === null || typeof corps.text !== 'string') {
    const raison = corps !== null && typeof corps.error === 'string' ? ` : ${corps.error.slice(0, 200)}` : '';
    throw new Error(`La transcription a échoué (réponse ${reponse.status})${raison}.`);
  }
  // whisper.cpp met une espace en tête de chaque segment, et un saut de ligne entre deux.
  return corps.text
    .split('\n')
    .map((ligne) => ligne.trim())
    .filter((ligne) => ligne !== '')
    .join(' ');
}

/** Un WAV plausible : en-tête RIFF/WAVE, taille bornée. */
export function estWav(octets: unknown): octets is Uint8Array {
  if (!(octets instanceof Uint8Array) || octets.length < 44 || octets.length > tailleMaxDUnWav) {
    return false;
  }
  const texte = (debut: number): string => String.fromCharCode(...octets.subarray(debut, debut + 4));
  return texte(0) === 'RIFF' && texte(8) === 'WAVE';
}
