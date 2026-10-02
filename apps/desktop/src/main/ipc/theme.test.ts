import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { themeParDefaut } from '@notes/ui/theme';
import { describe, expect, it, vi } from 'vitest';
import { SettingsStore } from '../settings/settings-store';
import { VaultService } from '../vault/vault-service';
import { creerHandlersTheme } from './theme';

async function monter(ouvert = true) {
  const base = await mkdtemp(join(tmpdir(), 'notes-ipc-theme-'));
  const dossier = join(base, 'vault');
  const vault = new VaultService(new SettingsStore(join(base, 'settings.json')), vi.fn(), join(base, 'propose'));
  if (ouvert) {
    await vault.definirDossier(dossier);
  }
  const ouvrirFichier = vi.fn(async () => '');
  const fichier = join(dossier, '.notes', 'theme.toml');
  return { handlers: creerHandlersTheme({ vault, ouvrirFichier }), vault, dossier, fichier, ouvrirFichier };
}

describe('handlers theme', () => {
  it("ne rend rien tant qu'aucun dossier de notes n'est ouvert, sans erreur", async () => {
    const { handlers } = await monter(false);
    expect(await handlers.lire()).toEqual({ texte: null, chemin: null, erreur: null });
    expect(await handlers.creer()).toMatchObject({ ok: false });
    expect(await handlers.ouvrir()).toMatchObject({ ok: false });
  });

  it("dit où serait le fichier quand il n'existe pas, sans le créer", async () => {
    const { handlers, fichier, vault } = await monter();
    expect(await handlers.lire()).toEqual({ texte: null, chemin: fichier, erreur: null });
    await expect(readFile(fichier, 'utf8')).rejects.toThrow();
    vault.arreter();
  });

  it('crée un thème par défaut commenté, puis le relit', async () => {
    const { handlers, fichier, vault } = await monter();
    expect(await handlers.creer()).toEqual({ ok: true });
    const ecrit = await readFile(fichier, 'utf8');
    expect(ecrit).toContain('[colors]\nbackground = "#16171b"');
    expect(await handlers.lire()).toEqual({ texte: ecrit, chemin: fichier, erreur: null });
    vault.arreter();
  });

  it("ne remplace jamais un fichier de thème qui existe", async () => {
    const { handlers, dossier, fichier, vault } = await monter();
    await mkdir(join(dossier, '.notes'));
    await writeFile(fichier, '[colors]\naccent = "#ff0000"\n');
    expect(await handlers.creer()).toEqual({ ok: true });
    expect(await readFile(fichier, 'utf8')).toBe('[colors]\naccent = "#ff0000"\n');
    vault.arreter();
  });

  it("refuse un fichier démesuré plutôt que de l'envoyer au renderer", async () => {
    const { handlers, dossier, fichier, vault } = await monter();
    await mkdir(join(dossier, '.notes'));
    await writeFile(fichier, '# '.padEnd(300_000, 'x'));
    expect(await handlers.lire()).toMatchObject({ texte: null, erreur: expect.stringContaining('trop gros') });
    vault.arreter();
  });

  it("enregistre le thème réglé dans l'application, après l'avoir revérifié", async () => {
    const { handlers, fichier, vault } = await monter();
    const theme = structuredClone(themeParDefaut);
    theme.colors.accent = '#ff8800';
    expect(await handlers.enregistrer(theme)).toEqual({ ok: true });
    expect(await readFile(fichier, 'utf8')).toContain('accent = "#ff8800"');

    // Une valeur refusée : rien n'est écrit, le fichier reste comme il était.
    const faux = structuredClone(themeParDefaut);
    faux.typography.font = 'x; } body { display: none';
    expect(await handlers.enregistrer(faux)).toMatchObject({ ok: false });
    expect(await handlers.enregistrer('n importe quoi')).toMatchObject({ ok: false });
    expect(await readFile(fichier, 'utf8')).toContain('accent = "#ff8800"');
    vault.arreter();
  });

  it("n'ouvre que le fichier de thème, et seulement s'il existe", async () => {
    const { handlers, fichier, ouvrirFichier, vault } = await monter();
    expect(await handlers.ouvrir()).toMatchObject({ ok: false });
    expect(ouvrirFichier).not.toHaveBeenCalled();
    await handlers.creer();
    expect(await handlers.ouvrir()).toEqual({ ok: true });
    expect(ouvrirFichier).toHaveBeenCalledWith(fichier);
    ouvrirFichier.mockResolvedValueOnce('aucune application');
    expect(await handlers.ouvrir()).toMatchObject({ ok: false });
    vault.arreter();
  });
});
