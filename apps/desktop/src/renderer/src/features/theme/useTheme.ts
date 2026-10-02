import { lireTheme, themeParDefaut, variablesDuTheme } from '@notes/ui';
import type { Theme } from '@notes/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ThemeFile } from '../../../../shared/ipc-contract';
import { api } from '../../lib/ipc';
import { poserVariables } from './apply-theme';

export interface ThemeStatus {
  /** Le thème appliqué. */
  theme: Theme;
  /** Le fichier tel que le main l'a lu. null tant que la première lecture n'est pas revenue. */
  fichier: ThemeFile | null;
  /** Ce qui a été ignoré dans le fichier. Vide si tout est bon ou s'il n'y a pas de fichier. */
  avertissements: string[];
  /** Relit le fichier tout de suite (après l'avoir créé, par exemple). */
  recharger: () => Promise<void>;
  /** Applique un thème tout de suite, sans attendre qu'il soit écrit puis relu : c'est ce qui rend le formulaire immédiat. */
  appliquer: (theme: Theme) => void;
  /** Vrai pendant qu'un réglage attend d'être écrit : le fichier, en retard sur l'écran, ne doit pas s'y réappliquer. */
  occupe: { current: boolean };
}

/**
 * Charge le thème du dossier des notes et le recharge à chaud (README §8) : le
 * fichier est relu à chaque modification du vault, et ses variables CSS sont
 * posées sur la racine du document. Une lecture ratée ou un fichier faux ne
 * bloque rien : le thème par défaut, ou les valeurs par défaut, s'appliquent.
 */
export function useTheme(dossier: string | null | undefined): ThemeStatus {
  const [fichier, definirFichier] = useState<ThemeFile | null>(null);
  const [theme, definirTheme] = useState<Theme>(themeParDefaut);
  const [avertissements, definirAvertissements] = useState<string[]>([]);
  const posees = useRef<string[]>([]);
  const dernierTexte = useRef<string | null | undefined>(undefined);
  const occupe = useRef(false);

  const recharger = useCallback(async () => {
    let lu: ThemeFile;
    try {
      lu = await api.lireTheme();
    } catch {
      lu = { texte: null, chemin: null, erreur: "Le fichier de thème n'a pas pu être lu." };
    }
    definirFichier((actuel) => (actuel?.texte === lu.texte && actuel.chemin === lu.chemin && actuel.erreur === lu.erreur ? actuel : lu));
    // Le vault change à chaque frappe enregistrée : on ne refait le travail que si le fichier de thème a changé.
    if (occupe.current || lu.texte === dernierTexte.current) {
      return;
    }
    dernierTexte.current = lu.texte;
    const { theme: applique, avertissements: ignores } = lireTheme(lu.texte);
    posees.current = poserVariables(document.documentElement, variablesDuTheme(applique), posees.current);
    definirTheme(applique);
    definirAvertissements(ignores);
  }, []);

  const appliquer = useCallback((choisi: Theme) => {
    posees.current = poserVariables(document.documentElement, variablesDuTheme(choisi), posees.current);
    definirTheme(choisi);
  }, []);

  useEffect(() => {
    if (dossier === undefined) {
      return;
    }
    void recharger();
    return api.surVaultModifie(() => void recharger());
  }, [dossier, recharger]);

  return { theme, fichier, avertissements, recharger, appliquer, occupe };
}
