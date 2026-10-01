import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SecretStore } from '../secrets/secret-store';
import { SettingsStore } from '../settings/settings-store';
import type { CompanionCredentials } from '../smb/protocol';
import { creerHandlersNas } from './nas';

const saisie = { hote: '192.168.1.30', partage: 'Eloi', utilisateur: 'Eloi', dossierVault: 'Notes' };

async function monter(trousseau = true) {
  const dossier = await mkdtemp(join(tmpdir(), 'notes-ipc-'));
  const recus: CompanionCredentials[] = [];
  const handlers = creerHandlersNas({
    reglages: new SettingsStore(join(dossier, 'settings.json')),
    secrets: new SecretStore(join(dossier, 'secrets.enc'), {
      disponible: () => trousseau,
      chiffrer: (texte) => Buffer.from(texte, 'utf8').reverse(),
      dechiffrer: (donnees) => Buffer.from(donnees).reverse().toString('utf8'),
    }),
    creerConnexion: (identifiants) => {
      recus.push(identifiants);
      throw new Error('aucune connexion réelle dans ce test');
    },
  });
  return { handlers, dossier, recus };
}

describe('handlers nas', () => {
  it('exige un mot de passe au premier enregistrement', async () => {
    const { handlers } = await monter();
    expect(await handlers.enregistrer(saisie)).toEqual({ ok: false, erreurs: { motDePasse: expect.any(String) } });
  });

  it("enregistre réglages et mot de passe sans jamais renvoyer ce dernier", async () => {
    const { handlers, dossier } = await monter();
    const resultat = await handlers.enregistrer({ ...saisie, motDePasse: 'secret-du-nas' });
    expect(resultat).toEqual({ ok: true, etat: { reglages: saisie, motDePasse: 'enregistre', stockageChiffre: true } });
    expect(JSON.stringify(resultat)).not.toContain('secret-du-nas');
    expect(await readFile(join(dossier, 'settings.json'), 'utf8')).not.toContain('secret-du-nas');
    expect(await readFile(join(dossier, 'secrets.enc'), 'utf8')).not.toContain('secret-du-nas');

    // Un second enregistrement sans mot de passe garde l'ancien.
    expect((await handlers.enregistrer({ ...saisie, hote: 'nas.local' })).ok).toBe(true);
    expect((await handlers.lireEtat()).motDePasse).toBe('enregistre');
  });

  it('refuse une saisie malformée venue du renderer', async () => {
    const { handlers } = await monter();
    for (const mauvaise of [null, 'texte', 42, { ...saisie, hote: '../x', motDePasse: 'x' }, { ...saisie, motDePasse: 12 }]) {
      expect((await handlers.enregistrer(mauvaise)).ok).toBe(false);
    }
    expect((await handlers.lireEtat()).reglages).toBeNull();
  });

  it('sans trousseau, garde le mot de passe pour la session seulement', async () => {
    const { handlers } = await monter(false);
    const resultat = await handlers.enregistrer({ ...saisie, motDePasse: 'secret' });
    expect(resultat).toMatchObject({ ok: true, etat: { motDePasse: 'session', stockageChiffre: false } });
  });

  it('refuse de tester sans réglages ou sans mot de passe', async () => {
    const { handlers, recus } = await monter();
    expect(await handlers.tester()).toMatchObject({ ok: false, erreur: { code: 'configuration' } });
    await handlers.enregistrer({ ...saisie, motDePasse: 'secret' });
    expect((await handlers.oublierMotDePasse()).motDePasse).toBe('absent');
    expect(await handlers.tester()).toMatchObject({ ok: false, erreur: { code: 'configuration' } });
    expect(recus).toEqual([]);
  });
});
