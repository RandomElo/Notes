import { join } from 'node:path';
import { LocalFsError, VaultError } from '@notes/core';
import { texteDuTheme, texteDuThemeParDefaut, verifierTheme } from '@notes/ui/theme-template';
import type { ThemeActionResult, ThemeFile } from '../../shared/ipc-contract';
import type { VaultService } from '../vault/vault-service';

/** Dossier des réglages rangés dans le vault, et le fichier de thème qu'il contient (README §8). */
const dossierDesReglages = '.notes';
const fichierDeTheme = `${dossierDesReglages}/theme.toml`;

/** Un thème tient en quelques kilo-octets : au-delà, ce n'en est pas un, et il n'est pas envoyé au renderer. */
const tailleMaxDuTheme = 200_000;

export interface ThemeHandlersDependencies {
  vault: VaultService;
  /** Ouvre un fichier dans l'application par défaut du système. Rend un message d'erreur, vide si tout va bien. */
  ouvrirFichier: (cheminAbsolu: string) => Promise<string>;
}

/**
 * Handlers des canaux « theme: ». Le main ne fait que lire, créer et ouvrir le
 * fichier : c'est le renderer qui l'interprète, avec une validation tolérante.
 */
export function creerHandlersTheme({ vault, ouvrirFichier }: ThemeHandlersDependencies) {
  const emplacement = (): string | null => {
    const { dossier } = vault.etat();
    return dossier === null ? null : join(dossier, dossierDesReglages, 'theme.toml');
  };

  const lire = async (): Promise<ThemeFile> => {
    const chemin = emplacement();
    if (chemin === null) {
      return { texte: null, chemin: null, erreur: null };
    }
    try {
      const fs = vault.contexte().fs;
      const infos = await fs.infos(fichierDeTheme);
      if (infos === null || infos.estDossier) {
        return { texte: null, chemin, erreur: null };
      }
      const texte = await fs.lireTexte(fichierDeTheme);
      return texte.length > tailleMaxDuTheme
        ? { texte: null, chemin, erreur: 'Le fichier de thème est trop gros pour être lu.' }
        : { texte, chemin, erreur: null };
    } catch (erreur) {
      return { texte: null, chemin, erreur: message(erreur, "Le fichier de thème n'a pas pu être lu.") };
    }
  };

  return {
    lire,

    /** Écrit un thème par défaut commenté. Jamais par-dessus un fichier existant. */
    creer: async (): Promise<ThemeActionResult> => {
      try {
        const fs = vault.contexte().fs;
        if ((await fs.infos(fichierDeTheme)) === null) {
          await fs.creerDossier(dossierDesReglages);
          await fs.ecrireTexte(fichierDeTheme, texteDuThemeParDefaut());
        }
        return { ok: true };
      } catch (erreur) {
        return { ok: false, message: message(erreur, "Le fichier de thème n'a pas pu être créé.") };
      }
    },

    /**
     * Écrit le thème réglé dans l'application. Ce qui vient du renderer est
     * revérifié valeur par valeur, et c'est le main qui rédige le fichier : le
     * renderer ne choisit jamais le texte écrit sur le disque.
     */
    enregistrer: async (recu: unknown): Promise<ThemeActionResult> => {
      const theme = verifierTheme(recu);
      if (theme === null) {
        return { ok: false, message: 'Ce thème contient une valeur refusée.' };
      }
      try {
        const fs = vault.contexte().fs;
        await fs.creerDossier(dossierDesReglages);
        await fs.ecrireTexte(fichierDeTheme, texteDuTheme(theme));
        return { ok: true };
      } catch (erreur) {
        return { ok: false, message: message(erreur, "Le thème n'a pas pu être enregistré.") };
      }
    },

    ouvrir: async (): Promise<ThemeActionResult> => {
      const chemin = emplacement();
      if (chemin === null || (await lire()).texte === null) {
        return { ok: false, message: "Le fichier de thème n'existe pas encore." };
      }
      const echec = await ouvrirFichier(chemin);
      return echec === '' ? { ok: true } : { ok: false, message: "Le fichier n'a pas pu être ouvert par le système." };
    },
  };
}

function message(erreur: unknown, defaut: string): string {
  return erreur instanceof VaultError || erreur instanceof LocalFsError ? erreur.message : defaut;
}
