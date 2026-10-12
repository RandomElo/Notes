import { variablesDuTheme } from '@notes/ui/theme';
import type { Theme } from '@notes/ui/theme';
import { useEffect, useRef } from 'react';

/** Pose des variables CSS sur un élément et retire celles de la fois d'avant qui n'y sont plus (même règle que le desktop). */
export function poserVariables(cible: HTMLElement, variables: Record<string, string>, precedentes: readonly string[] = []): string[] {
  for (const nom of precedentes) {
    if (!(nom in variables)) {
      cible.style.removeProperty(nom);
    }
  }
  for (const [nom, valeur] of Object.entries(variables)) {
    cible.style.setProperty(nom, valeur);
  }
  return Object.keys(variables);
}

/** Le thème du dossier des notes (`.notes/theme.toml`), le même que sur le desktop. */
export function useThemeApplique(theme: Theme): void {
  const posees = useRef<string[]>([]);
  useEffect(() => {
    posees.current = poserVariables(document.documentElement, variablesDuTheme(theme), posees.current);
  }, [theme]);
}
