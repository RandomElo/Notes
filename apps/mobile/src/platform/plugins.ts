import { registerPlugin } from '@capacitor/core';

/** Une entrée de dossier telle que le plugin la renvoie (même forme que `RemoteEntry`). */
export interface EntreeSmb {
  nom: string;
  estDossier: boolean;
  taille: number;
  modifieLe: number;
}

export interface ReglagesSmb {
  /** Adresse sur le réseau local, essayée d'abord. */
  hote: string;
  /** Adresse Tailscale, essayée si la locale ne répond pas vite ; vide : aucune. */
  hoteTailscale: string;
  partage: string;
  utilisateur: string;
}

/** Ce que la session ouverte a obtenu du NAS. Le plugin refuse toute session à qui il manque l'un des trois. */
export interface SessionSmb {
  dialecte: string;
  signee: boolean;
  chiffree: boolean;
  /** La session passe par l'adresse Tailscale. */
  parTailscale: boolean;
}

/**
 * Plugin natif `SmbPlugin.kt` (smbj). Le mot de passe ne traverse le pont
 * qu'une fois, à la première connexion : le plugin le chiffre par l'Android
 * Keystore et ne le rend jamais. Les erreurs portent un code de
 * `RemoteFsErrorCode`.
 */
export interface SmbPlugin {
  /**
   * Ouvre la session. Avec `motDePasse`, il est essayé puis enregistré s'il marche ; sans, le mot de passe enregistré sert.
   * `rouvrir` : le réseau a changé, la session ouverte est refaite (l'adresse qui répond n'est peut-être plus la même).
   */
  connecter(options: ReglagesSmb & { motDePasse?: string; rouvrir?: boolean }): Promise<SessionSmb>;
  deconnecter(): Promise<void>;
  infos(options: { chemin: string }): Promise<{ entree: EntreeSmb | null }>;
  lister(options: { chemin: string }): Promise<{ entrees: EntreeSmb[] }>;
  /** Contenu en base64. */
  lire(options: { chemin: string }): Promise<{ donnees: string }>;
  /** Écrit dans un fichier temporaire du même dossier, puis renomme. */
  ecrire(options: { chemin: string; donnees: string }): Promise<void>;
  creerDossier(options: { chemin: string }): Promise<void>;
  renommer(options: { chemin: string; vers: string }): Promise<void>;
  supprimer(options: { chemin: string }): Promise<void>;
}

/** Plugin natif `SecretsPlugin.kt` : savoir si un mot de passe est enregistré, l'effacer. Jamais le lire. */
export interface SecretsPlugin {
  presence(): Promise<{ present: boolean }>;
  effacer(): Promise<void>;
}

/** Plugin natif `RecorderPlugin.kt` : enregistrement d'un mémo vocal (J17), rangé dans le dossier privé `memos`. */
export interface RecorderPlugin {
  /** Demande le micro au premier mémo. Rejeté avec un code (`micro_refuse`, `micro_indisponible`) et un message à montrer. */
  demarrer(options: { nom: string }): Promise<void>;
  /** Nom du mémo rangé, null s'il n'a pas pu être gardé (trop court). */
  terminer(): Promise<{ nom: string | null }>;
  annuler(): Promise<void>;
  etat(): Promise<{ enCours: boolean; depuis: number; niveau: number; erreur: string | null }>;
}

export const Smb = registerPlugin<SmbPlugin>('Smb');
export const Recorder = registerPlugin<RecorderPlugin>('Recorder');
export const Secrets = registerPlugin<SecretsPlugin>('Secrets');
