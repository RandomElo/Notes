import { Secrets } from './plugins';

/**
 * Mot de passe du NAS (docs/spec/securite.md) : chiffré par une clé de l'Android
 * Keystore dans le stockage privé de l'application, par le plugin natif.
 * L'interface sait seulement s'il existe, et peut l'effacer.
 */
export async function motDePasseEnregistre(): Promise<boolean> {
  try {
    return (await Secrets.presence()).present;
  } catch {
    return false;
  }
}

export async function oublierMotDePasse(): Promise<void> {
  await Secrets.effacer();
}
