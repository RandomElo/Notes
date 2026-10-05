import { describe, expect, it } from 'vitest';
import { cheminDuDemarrage, contenuDuDemarrage, reglagesDuServeur, scriptDeLancement } from './launcher';

describe('lancement de LanguageTool avec la session', () => {
  it('écrit un fichier de démarrage qui lance le script du dossier', () => {
    expect(cheminDuDemarrage('/home/utilisateur/.config')).toBe('/home/utilisateur/.config/autostart/notes-languagetool.desktop');
    const contenu = contenuDuDemarrage('/home/utilisateur/Mes "applis"/LanguageTool');
    expect(contenu).toContain('Exec=/bin/bash "/home/utilisateur/Mes \\"applis\\"/LanguageTool/lancer.sh"');
    expect(contenu).toContain('X-GNOME-Autostart-enabled=true');
  });

  it('lance Java sur le port 8081, sans les variables du poste, avec le cache des règles', () => {
    const script = scriptDeLancement();
    expect(script).toContain('--port 8081');
    expect(script).toContain('exec env -i LC_ALL=C.UTF-8 "$dossier/java/bin/java"');
    expect(script).not.toContain('--public');
    expect(reglagesDuServeur('/d/LanguageTool')).toContain('pipelineCaching=true');
    expect(reglagesDuServeur('/d/LanguageTool')).toContain('languageModel=/d/LanguageTool/ngrammes');
  });
});
