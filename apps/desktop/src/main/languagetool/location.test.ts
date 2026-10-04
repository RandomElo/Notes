import { describe, expect, it } from 'vitest';
import { dossierDeLanguageTool } from './location';

describe('dossier de LanguageTool', () => {
  it("se met à côté de l'AppImage", () => {
    expect(dossierDeLanguageTool({ APPIMAGE: '/home/utilisateur/Applications/Notes.AppImage' }, '/home/utilisateur')).toBe('/home/utilisateur/Applications/LanguageTool');
  });

  it('va dans ~/Applications hors AppImage', () => {
    expect(dossierDeLanguageTool({}, '/home/utilisateur')).toBe('/home/utilisateur/Applications/LanguageTool');
  });

  it("suit le dossier imposé pour un essai, s'il est absolu", () => {
    expect(dossierDeLanguageTool({ NOTES_DOSSIER_LANGUAGETOOL: '/tmp/essai/LanguageTool' }, '/home/utilisateur')).toBe('/tmp/essai/LanguageTool');
    expect(dossierDeLanguageTool({ NOTES_DOSSIER_LANGUAGETOOL: 'relatif' }, '/home/utilisateur')).toBe('/home/utilisateur/Applications/LanguageTool');
  });
});
