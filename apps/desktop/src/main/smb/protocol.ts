/**
 * Messages échangés avec le binaire compagnon : une requête JSON par ligne
 * sur son entrée standard, une réponse par ligne sur sa sortie. Miroir de
 * apps/smb-companion/internal/protocol/messages.go, à modifier ensemble.
 */
export type CompanionRequest =
  | { op: 'connecter'; hote: string; partage: string; utilisateur: string; motDePasse: string }
  | { op: 'deconnecter' | 'ping' | 'infosSession' }
  | { op: 'infos' | 'lister' | 'lire' | 'creerDossier' | 'supprimer'; chemin: string }
  | { op: 'ecrire'; chemin: string; contenu: string }
  | { op: 'renommer'; chemin: string; vers: string };

export interface CompanionResponse {
  id: number;
  ok: boolean;
  resultat?: unknown;
  erreur?: { code: string; message: string };
}

export interface CompanionEntry {
  nom: string;
  estDossier: boolean;
  taille: number;
  modifieLe: number;
}

export interface CompanionSessionInfo {
  dialecte: string;
  signature: boolean;
  chiffrement: boolean;
  reponsesChiffrees: number;
  reponsesTotal: number;
}

export interface CompanionCredentials {
  hote: string;
  partage: string;
  utilisateur: string;
  motDePasse: string;
}
