import { safeStorage } from 'electron';
import type { SecretCipher } from './secret-store';

/**
 * Chiffrement par le trousseau du système via safeStorage. Sous Linux,
 * Electron retombe sur « basic_text » quand aucun trousseau n'est présent :
 * ce mode ne protège rien, il est donc traité comme indisponible.
 */
export const chiffreSafeStorage: SecretCipher = {
  disponible() {
    if (!safeStorage.isEncryptionAvailable()) {
      return false;
    }
    const moteur = safeStorage.getSelectedStorageBackend();
    return moteur !== 'basic_text' && moteur !== 'unknown';
  },
  chiffrer(texte) {
    return safeStorage.encryptString(texte);
  },
  dechiffrer(donnees) {
    return safeStorage.decryptString(donnees);
  },
};
