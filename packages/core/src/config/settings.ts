import { verifierCheminRelatif } from '../fs/paths';
import { lireReglagesIa, reglagesIaParDefaut } from './ai-settings';
import type { AiSettings } from './ai-settings';

/**
 * Réglages locaux de l'application (un fichier par appareil, jamais
 * synchronisé). Aucun identifiant ici : le mot de passe vit dans le coffre à
 * secrets de la plateforme.
 */
export interface Settings {
  nas: NasSettings | null;
  /** Chemin absolu du dossier du vault sur cet appareil, null tant qu'il n'est pas choisi. */
  vaultLocal: string | null;
  /** Identifiant de cette installation, tiré au hasard au premier besoin. Signe les verrous de page sur le NAS. */
  appareil: string | null;
  /** Fonctions IA de ce poste (J12). */
  ia: AiSettings;
  /** Page « Mémos vocaux » masquée sur ce poste : les mémos présents au moment de masquer. null quand elle est visible (J13). */
  memosMasques: string[] | null;
}

export interface NasSettings {
  /** Nom d'hôte ou adresse IPv4 du NAS. */
  hote: string;
  /** Nom du partage SMB. */
  partage: string;
  utilisateur: string;
  /** Dossier du vault dans le partage, vide pour la racine. */
  dossierVault: string;
}

export type NasSettingsField = keyof NasSettings;

export type NasSettingsValidation =
  | { ok: true; valeur: NasSettings }
  | { ok: false; erreurs: Partial<Record<NasSettingsField, string>> };

export const reglagesParDefaut: Settings = { nas: null, vaultLocal: null, appareil: null, ia: reglagesIaParDefaut, memosMasques: null };

const hoteValide = /^[A-Za-z0-9]([A-Za-z0-9._-]{0,251}[A-Za-z0-9])?$/;
// eslint-disable-next-line no-control-regex
const partageInterdit = /[\\/:*?"<>|\u0000-\u001f]/;
// eslint-disable-next-line no-control-regex
const controle = /[\u0000-\u001f]/;

/** Nom d'hôte ou adresse IPv4, sans chemin ni préfixe SMB. */
export function estHoteValide(valeur: string): boolean {
  return hoteValide.test(valeur);
}

/** Valide des réglages NAS venus de l'extérieur (formulaire, fichier, IPC). */
export function validerReglagesNas(valeur: unknown): NasSettingsValidation {
  if (typeof valeur !== 'object' || valeur === null) {
    return { ok: false, erreurs: { hote: 'Réglages illisibles.' } };
  }
  const brut = valeur as Record<string, unknown>;
  const texte = (champ: NasSettingsField): string => {
    const contenu = brut[champ];
    return typeof contenu === 'string' ? contenu.trim() : '';
  };
  const reglages: NasSettings = {
    hote: texte('hote'),
    partage: texte('partage'),
    utilisateur: texte('utilisateur'),
    dossierVault: texte('dossierVault'),
  };

  const erreurs: Partial<Record<NasSettingsField, string>> = {};
  if (!hoteValide.test(reglages.hote)) {
    erreurs.hote = "Indique un nom d'hôte ou une adresse IP, sans « \\\\ » ni « / ».";
  }
  if (reglages.partage === '' || reglages.partage.length > 80 || partageInterdit.test(reglages.partage)) {
    erreurs.partage = 'Indique le nom du partage seul, sans « \\ » ni « / ».';
  }
  if (reglages.utilisateur === '' || reglages.utilisateur.length > 256 || controle.test(reglages.utilisateur)) {
    erreurs.utilisateur = "Indique le nom d'utilisateur du NAS.";
  }
  if (reglages.dossierVault !== '') {
    const refus = verifierCheminRelatif(reglages.dossierVault);
    if (refus !== null) {
      erreurs.dossierVault = refus;
    }
  }

  return Object.keys(erreurs).length > 0 ? { ok: false, erreurs } : { ok: true, valeur: reglages };
}

/** Vrai pour un chemin absolu Unix utilisable comme dossier de vault. */
export function estCheminAbsolu(valeur: unknown): valeur is string {
  // eslint-disable-next-line no-control-regex
  return typeof valeur === 'string' && valeur.startsWith('/') && valeur.length <= 4096 && !/[\u0000-\u001f]/.test(valeur);
}

/**
 * Lit des réglages depuis un contenu quelconque. Tolérant : ce qui est
 * invalide est remplacé par le défaut, un fichier abîmé ne bloque pas l'app.
 */
export function lireReglages(valeur: unknown): Settings {
  if (typeof valeur !== 'object' || valeur === null) {
    return { ...reglagesParDefaut, ia: lireReglagesIa(null) };
  }
  const brut = valeur as Record<string, unknown>;
  const nas = validerReglagesNas(brut['nas']);
  return {
    nas: nas.ok ? nas.valeur : null,
    vaultLocal: estCheminAbsolu(brut['vaultLocal']) ? brut['vaultLocal'] : null,
    appareil: estIdentifiantDAppareil(brut['appareil']) ? brut['appareil'] : null,
    ia: lireReglagesIa(brut['ia']),
    memosMasques: lireMemosMasques(brut['memosMasques']),
  };
}

/** Un identifiant d'appareil : des chiffres hexadécimaux et des tirets, rien d'autre. */
export function estIdentifiantDAppareil(valeur: unknown): valeur is string {
  return typeof valeur === 'string' && /^[0-9a-f-]{8,64}$/.test(valeur);
}

/** Les noms des mémos vus au moment de masquer leur page ; null pour une page visible ou un contenu abîmé. */
function lireMemosMasques(valeur: unknown): string[] | null {
  return Array.isArray(valeur) && valeur.length <= 10_000 && valeur.every((nom) => typeof nom === 'string' && nom.length <= 255 && !nom.includes('/')) ? (valeur as string[]) : null;
}
