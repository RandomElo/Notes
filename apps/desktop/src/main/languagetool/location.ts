import { dirname, isAbsolute, join } from 'node:path';

/**
 * Dossier de LanguageTool (docs/spec/correction.md) : à côté de l'AppImage, hors de ses
 * fichiers (`~/Applications/LanguageTool`). Hors AppImage (développement),
 * dans `~/Applications`. `NOTES_DOSSIER_LANGUAGETOOL` le remplace, pour un
 * essai qui ne doit pas toucher à l'installation du poste.
 */
export function dossierDeLanguageTool(env: NodeJS.ProcessEnv, maison: string): string {
  const impose = env['NOTES_DOSSIER_LANGUAGETOOL'];
  if (impose !== undefined && isAbsolute(impose)) {
    return impose;
  }
  const appImage = env['APPIMAGE'];
  return join(appImage !== undefined && isAbsolute(appImage) ? dirname(appImage) : join(maison, 'Applications'), 'LanguageTool');
}
