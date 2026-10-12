/**
 * Mémos vocaux (docs/spec/memos.md) : ce que le main et le renderer s'échangent. Les
 * canaux sont dans `ipc-contract.ts`, avec les autres.
 */

/** La transcription : modèle téléchargé ou non, serveur lancé ou non, carte utilisée. */
export interface WhisperState {
  /** Le serveur whisper.cpp est livré avec Notes (absent en développement tant que `npm run build:whisper` n'a pas tourné). */
  binaire: boolean;
  modele: 'absent' | 'telechargement' | 'pret';
  /** Avancement du téléchargement du modèle, en octets. */
  recus: number;
  total: number;
  serveur: 'arrete' | 'pret';
  /** Carte graphique qui fera la transcription ; null : sur le processeur, plus lentement. */
  carte: string | null;
  /** Dernière erreur (téléchargement, démarrage), null sinon. */
  erreur: string | null;
  /** Dossier du modèle. */
  dossier: string;
}

export interface MemoView {
  nom: string;
  /** Chemin dans le dossier des notes (`.notes/memos/…`). */
  chemin: string;
  /** Moment de l'enregistrement, en millisecondes. */
  date: number;
  taille: number;
  /** Titre de la sous-page qu'il deviendra. */
  titre: string;
}

export interface MemosState {
  memos: MemoView[];
  /** La page « Mémos vocaux », null tant qu'aucun mémo n'est arrivé. */
  page: { chemin: string; id: string } | null;
  /** Masquée de l'arborescence sur ce poste. */
  masquee: boolean;
  whisper: WhisperState;
}

export type MemoTranscription = { ok: true; texte: string; dureeMs: number } | { ok: false; message: string };

/** Un mémo décodé par le ffmpeg de Notes : WAV 16 kHz mono et sa durée en secondes. */
export type MemoConversion = { ok: true; wav: Uint8Array; duree: number } | { ok: false; message: string };

export type MemoAcceptance = { ok: true; chemin: string; id: string } | { ok: false; message: string };

/**
 * Durées estimées avant de transcrire (docs/spec/memos.md) : par mémo, la transcription
 * et la mise en forme ; null quand on ne peut pas l'estimer (durée de l'audio
 * illisible, IA locale absente ou jamais utilisée sur ce poste).
 */
export interface MemoEstimate {
  /** Démarrage du serveur de transcription, compté dans le premier mémo s'il est arrêté. */
  demarrageMs: number;
  memos: { chemin: string; audioMs: number | null; transcriptionMs: number | null; miseEnFormeMs: number | null }[];
}
