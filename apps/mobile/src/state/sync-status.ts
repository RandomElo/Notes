import type { RemoteFsErrorCode } from '@notes/core';

/** État du NAS vu du téléphone. */
export type EtatNas =
  | { genre: 'inconnu' }
  | { genre: 'synchro'; faits: number; total: number }
  | { genre: 'a-jour' }
  | { genre: 'injoignable'; depuis: number; horsReseau: boolean }
  /** Le NAS a répondu mais refuse : identifiants, partage, chiffrement. Plus d'essai automatique avant un changement de réglages. */
  | { genre: 'refuse'; message: string }
  | { genre: 'erreur'; message: string };

/** Codes qui ne se règlent pas en réessayant : on ne fait pas verrouiller le compte par le NAS (docs/spec/sync.md). */
export const codesBloquants: ReadonlySet<RemoteFsErrorCode> = new Set(['identifiants_refuses', 'partage_introuvable', 'chiffrement_absent', 'acces_refuse']);

const messagesDeRefus: Partial<Record<RemoteFsErrorCode, string>> = {
  identifiants_refuses: 'Identifiants refusés par le NAS',
  partage_introuvable: 'Partage introuvable sur le NAS',
  chiffrement_absent: 'Le NAS refuse le chiffrement SMB 3.1.1',
  acces_refuse: 'Accès refusé au dossier des notes',
};

export function messageDeRefus(code: RemoteFsErrorCode): string {
  return messagesDeRefus[code] ?? 'Le NAS refuse la connexion';
}

const majuscule = (texte: string): string => texte.charAt(0).toUpperCase() + texte.slice(1);
const deux = (nombre: number): string => String(nombre).padStart(2, '0');
const mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** « 14:02 », « hier à 18:30 », « le 3 octobre à 18:30 ». */
export function momentLisible(instant: number, maintenant: number): string {
  const date = new Date(instant);
  const heure = `${deux(date.getHours())}:${deux(date.getMinutes())}`;
  const jour = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const ecart = Math.round((jour(new Date(maintenant)) - jour(date)) / 86_400_000);
  if (ecart === 0) {
    return heure;
  }
  if (ecart === 1) {
    return `hier à ${heure}`;
  }
  return `le ${date.getDate()} ${mois[date.getMonth()]} à ${heure}`;
}

/** Ce que dit la pastille d'état. `avecTailscale` : une adresse Tailscale est réglée, elle n'a pas répondu non plus. */
export function libelleDeLEtat(etat: EtatNas, derniereSync: number | null, maintenant: number, avecTailscale = false): string {
  const derniere = derniereSync === null ? 'jamais synchronisé' : `synchronisé ${derniereSync > maintenant - 60_000 ? "à l'instant" : momentLisible(derniereSync, maintenant).replace(/^(\d)/, 'à $1')}`;
  switch (etat.genre) {
    case 'inconnu':
      return derniere;
    case 'synchro':
      return etat.total > 0 ? `Téléchargement, ${etat.faits} sur ${etat.total}` : 'Synchronisation…';
    case 'a-jour':
      return `NAS joignable, ${derniere}`;
    case 'injoignable':
      if (etat.horsReseau) {
        return `Pas de réseau, ${derniere}`;
      }
      return avecTailscale ? `NAS injoignable, même par Tailscale : est-il activé ? ${majuscule(derniere)}` : `NAS injoignable, ${derniere}`;
    case 'refuse':
    case 'erreur':
      return etat.message;
  }
}
