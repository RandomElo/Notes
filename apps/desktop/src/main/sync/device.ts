import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import type { LockOwner } from '@notes/core';
import type { SettingsStore } from '../settings/settings-store';

/**
 * Identité de ce poste pour les verrous de page : un identifiant tiré au
 * hasard au premier besoin et gardé dans les réglages locaux, et le nom de la
 * machine, que l'autre appareil affiche (« Page en cours de modification sur … »).
 */
export function identiteDuPoste(reglages: SettingsStore): () => Promise<LockOwner> {
  let identite: Promise<LockOwner> | null = null;
  return () => {
    identite ??= (async () => {
      const actuels = await reglages.lire();
      let appareil = actuels.appareil;
      if (appareil === null) {
        appareil = randomUUID();
        await reglages.ecrire({ ...actuels, appareil });
      }
      return { appareil, nom: hostname().slice(0, 100), pid: process.pid };
    })();
    return identite;
  };
}
