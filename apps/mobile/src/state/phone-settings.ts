import { estHoteValide, validerReglagesNas } from '@notes/core';
import type { NasSettings } from '@notes/core';

/**
 * Réglages du téléphone, dans le stockage privé de l'application (README
 * §16), jamais synchronisés. Aucun identifiant ici : le mot de passe est
 * chiffré à part par le plugin natif.
 */
export interface PhoneSettings {
  nas: NasSettings | null;
  /** Adresse Tailscale du NAS, essayée quand l'adresse locale (`nas.hote`) ne répond pas vite. Vide : aucune. */
  hoteTailscale: string;
  /** Identifiants des pages ouvertes, la plus récente en tête. */
  recentes: string[];
  /** Fin de la dernière sync réussie, en millisecondes. */
  derniereSync: number | null;
  /** Identifiant de ce téléphone dans les verrous de page, tiré au hasard au premier lancement. */
  appareil: string | null;
}

export const fichierDesReglages = 'reglages.json';
export const nombreDeRecentes = 12;

export const reglagesVides: PhoneSettings = { nas: null, hoteTailscale: '', recentes: [], derniereSync: null, appareil: null };

/** Nom montré à l'autre appareil quand le téléphone tient le verrou d'une page. */
export const nomDuTelephone = 'téléphone';

/** Lecture tolérante : ce qui est abîmé revient au défaut, sans bloquer l'application. */
export function lireReglagesDuTelephone(texte: string | null): PhoneSettings {
  let brut: unknown;
  try {
    brut = texte === null ? null : JSON.parse(texte);
  } catch {
    brut = null;
  }
  if (typeof brut !== 'object' || brut === null) {
    return reglagesVides;
  }
  const objet = brut as Record<string, unknown>;
  const nas = validerReglagesNas(objet['nas']);
  const recentes = Array.isArray(objet['recentes'])
    ? objet['recentes'].filter((id): id is string => typeof id === 'string' && id.length <= 64).slice(0, nombreDeRecentes)
    : [];
  const derniereSync = typeof objet['derniereSync'] === 'number' && Number.isFinite(objet['derniereSync']) ? objet['derniereSync'] : null;
  const tailscale = typeof objet['hoteTailscale'] === 'string' ? objet['hoteTailscale'].trim() : '';
  const appareil = typeof objet['appareil'] === 'string' && /^[0-9a-z-]{8,64}$/i.test(objet['appareil']) ? objet['appareil'] : null;
  return { nas: nas.ok ? nas.valeur : null, hoteTailscale: estHoteValide(tailscale) ? tailscale : '', recentes, derniereSync, appareil };
}

/** La page ouverte passe en tête des récentes. */
export function avecPageRecente(reglages: PhoneSettings, id: string): PhoneSettings {
  return { ...reglages, recentes: [id, ...reglages.recentes.filter((autre) => autre !== id)].slice(0, nombreDeRecentes) };
}

/** Clé du cache : un autre NAS, partage ou dossier repart d'un cache vide. */
export function cleDuCache(nas: NasSettings): string {
  return JSON.stringify([nas.hote.toLowerCase(), nas.partage.toLowerCase(), nas.dossierVault]);
}
