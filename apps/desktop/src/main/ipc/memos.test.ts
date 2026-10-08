import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { WhisperState } from '../../shared/memos-contract';
import { SettingsStore } from '../settings/settings-store';
import { creerFileDAttente } from '../vault/serial-queue';
import { VaultService } from '../vault/vault-service';
import { creerHandlersMemos } from './memos';
import { creerHandlersVault } from './vault';

const etatWhisper: WhisperState = { binaire: true, modele: 'pret', recus: 0, total: 1, serveur: 'arrete', carte: 'Carte d’essai', erreur: null, dossier: '/w' };

async function monter(whisperEtat: WhisperState = etatWhisper) {
  const base = await mkdtemp(join(tmpdir(), 'notes-ipc-memos-'));
  const reglages = new SettingsStore(join(base, 'settings.json'));
  const vault = new VaultService(reglages, vi.fn(), join(base, 'propose'));
  const file = creerFileDAttente();
  const handlersVault = creerHandlersVault({ vault, file, choisirDossier: async () => join(base, 'vault') });
  await handlersVault.choisirDossier();
  const dossier = join(base, 'vault');
  const transcrire = vi.fn(async () => ({ ok: true as const, texte: 'bonjour', dureeMs: 10 }));
  const installerModele = vi.fn(() => whisperEtat);
  const convertir = vi.fn(async (_fichier: string) => new Uint8Array(44 + 32_000));
  const ouvrirDossier = vi.fn(async (_dossier: string) => '');
  const memos = creerHandlersMemos({
    vault,
    enSerie: file.enSerie,
    reglages,
    whisper: { etat: () => whisperEtat, installerModele, annulerInstallation: () => undefined, transcrire },
    convertir,
    ouvrirDossier,
  });
  const deposer = async (nom: string, contenu = 'audio'): Promise<void> => {
    await mkdir(join(dossier, '.notes', 'memos'), { recursive: true });
    await writeFile(join(dossier, '.notes', 'memos', nom), contenu);
  };
  return { memos, dossier, deposer, transcrire, reglages, installerModele, convertir, ouvrirDossier };
}

describe('handlers mémos', () => {
  it('décode par ffmpeg un mémo du dossier des mémos seulement, avec sa durée', async () => {
    const { memos, deposer, dossier, convertir } = await monter();
    await deposer('memo-2026-10-07-162405.amr');
    expect(await memos.convertir({ chemin: '.notes/memos/memo-2026-10-07-162405.amr' })).toMatchObject({ ok: true, duree: 1 });
    expect(convertir).toHaveBeenCalledWith(join(dossier, '.notes', 'memos', 'memo-2026-10-07-162405.amr'));
    for (const chemin of ['Bienvenue/page.md', '.notes/memos/../../secret.wav', '/etc/passwd']) {
      expect(await memos.convertir({ chemin })).toMatchObject({ ok: false });
    }
    expect(convertir).toHaveBeenCalledTimes(1);
  });

  it('ouvre le dossier des mémos, créé s’il manque', async () => {
    const { memos, dossier, ouvrirDossier } = await monter();
    expect(await memos.ouvrirDossier()).toEqual({ ok: true });
    expect(ouvrirDossier).toHaveBeenCalledWith(join(dossier, '.notes', 'memos'));
    expect(await readdir(join(dossier, '.notes', 'memos'))).toEqual([]);
  });

  it('télécharge le modèle de lui-même au premier mémo, une seule fois', async () => {
    const { memos, deposer, installerModele } = await monter({ ...etatWhisper, modele: 'absent' });
    await memos.etat();
    expect(installerModele).not.toHaveBeenCalled();
    await deposer('memo-2026-10-07-162405.m4a');
    await memos.etat();
    await memos.etat();
    expect(installerModele).toHaveBeenCalledTimes(1);
  });

  it('ne crée la page « Mémos vocaux » qu’au premier mémo', async () => {
    const { memos, deposer } = await monter();
    expect(await memos.etat()).toMatchObject({ memos: [], page: null, masquee: false, whisper: etatWhisper });
    await deposer('memo-2026-10-07-162405.m4a');
    const etat = await memos.etat();
    expect(etat.page?.chemin).toBe('Mémos vocaux');
    expect(etat.memos).toEqual([expect.objectContaining({ chemin: '.notes/memos/memo-2026-10-07-162405.m4a', titre: 'Mémo du 7 octobre 2026 à 16 h 24' })]);
  });

  it('accepte un mémo : sous-page créée, audio à la corbeille', async () => {
    const { memos, deposer, dossier } = await monter();
    await deposer('memo-2026-10-07-162405.m4a');
    const resultat = await memos.accepter({ chemin: '.notes/memos/memo-2026-10-07-162405.m4a', corps: 'Penser au pain.' });
    expect(resultat).toMatchObject({ ok: true, chemin: 'Mémos vocaux/Mémo du 7 octobre 2026 à 16 h 24' });
    expect(await readFile(join(dossier, 'Mémos vocaux', 'Mémo du 7 octobre 2026 à 16 h 24', 'page.md'), 'utf8')).toContain('Penser au pain.\n');
    expect(await readdir(join(dossier, '.notes', 'memos'))).toEqual([]);
    expect((await memos.etat()).memos).toEqual([]);
    expect(await memos.accepter({ chemin: '.notes/memos/memo-2026-10-07-162405.m4a', corps: 'encore' })).toMatchObject({ ok: false });
  });

  it('met un mémo à la corbeille sans le transcrire', async () => {
    const { memos, deposer } = await monter();
    await deposer('memo-2026-10-07-162405.m4a');
    expect((await memos.ecarter({ chemin: '.notes/memos/memo-2026-10-07-162405.m4a' })).memos).toEqual([]);
  });

  it('masque la page, et la fait réapparaître à l’arrivée d’un nouveau mémo', async () => {
    const { memos, deposer, reglages } = await monter();
    await deposer('memo-2026-10-07-162405.m4a');
    expect((await memos.masquer({ masquer: true })).masquee).toBe(true);
    expect((await memos.etat()).masquee).toBe(true);
    await deposer('memo-2026-10-08-090000.m4a');
    expect((await memos.etat()).masquee).toBe(false);
    expect((await reglages.lire()).memosMasques).toBeNull();
  });

  it('ne lit ni ne déplace rien hors de .notes/memos/, et refuse un audio qui n’est pas un WAV', async () => {
    const { memos, deposer, transcrire } = await monter();
    await deposer('memo-2026-10-07-162405.m4a', 'son');
    expect(await memos.lire({ chemin: '.notes/memos/memo-2026-10-07-162405.m4a' })).toEqual(new Uint8Array(Buffer.from('son')));
    expect(await memos.lire({ chemin: '.notes/theme.toml' })).toBeNull();
    expect(await memos.lire({ chemin: '.notes/memos/../../secret.m4a' })).toBeNull();
    expect(await memos.accepter({ chemin: 'Page/page.md', corps: 'x' })).toMatchObject({ ok: false });
    expect(await memos.transcrire({ wav: new Uint8Array(10) })).toEqual({ ok: false, message: 'Audio illisible.' });
    expect(transcrire).not.toHaveBeenCalled();
  });
});
