import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { SecretStore } from './secret-store';
import type { SecretCipher } from './secret-store';

// Faux chiffrement reconnaissable : suffit à vérifier que le clair n'atteint jamais le disque.
function fauxChiffre(disponible: boolean): SecretCipher {
  return {
    disponible: () => disponible,
    chiffrer: (texte) => Buffer.from([...Buffer.from(texte, 'utf8')].map((octet) => octet ^ 0x5a)),
    dechiffrer: (donnees) => Buffer.from([...donnees].map((octet) => octet ^ 0x5a)).toString('utf8'),
  };
}

let fichier: string;

beforeEach(async () => {
  fichier = join(await mkdtemp(join(tmpdir(), 'notes-secrets-')), 'sous-dossier', 'secrets.enc');
});

describe('SecretStore avec trousseau', () => {
  it('enregistre chiffré, relit depuis le disque et oublie', async () => {
    const coffre = new SecretStore(fichier, fauxChiffre(true));
    expect(await coffre.etat('nas')).toBe('absent');
    expect(await coffre.enregistrer('nas', 'mot de passe très secret')).toBe('enregistre');

    const surDisque = await readFile(fichier, 'utf8');
    expect(surDisque).not.toContain('mot de passe très secret');
    expect((await stat(fichier)).mode & 0o777).toBe(0o600);

    const autreInstance = new SecretStore(fichier, fauxChiffre(true));
    expect(await autreInstance.lire('nas')).toBe('mot de passe très secret');
    expect(await autreInstance.etat('nas')).toBe('enregistre');

    await autreInstance.oublier('nas');
    expect(await autreInstance.lire('nas')).toBeNull();
    expect(await readFile(fichier, 'utf8')).not.toContain('nas');
  });

  it('traite un fichier abîmé comme un coffre vide', async () => {
    const coffre = new SecretStore(fichier, fauxChiffre(true));
    await coffre.enregistrer('nas', 'x');
    await writeFile(fichier, '{ pas du json');
    expect(await coffre.lire('nas')).toBeNull();
    expect(await coffre.enregistrer('nas', 'y')).toBe('enregistre');
    expect(await coffre.lire('nas')).toBe('y');
  });

  it("rend null quand le déchiffrement échoue", async () => {
    const coffre = new SecretStore(fichier, fauxChiffre(true));
    await coffre.enregistrer('nas', 'x');
    const casse: SecretCipher = {
      ...fauxChiffre(true),
      dechiffrer: () => {
        throw new Error('trousseau changé');
      },
    };
    expect(await new SecretStore(fichier, casse).lire('nas')).toBeNull();
  });
});

describe('SecretStore sans trousseau', () => {
  it("garde le secret en mémoire et n'écrit rien sur le disque", async () => {
    const coffre = new SecretStore(fichier, fauxChiffre(false));
    expect(coffre.stockageChiffre()).toBe(false);
    expect(await coffre.enregistrer('nas', 'secret')).toBe('session');
    expect(await coffre.lire('nas')).toBe('secret');
    expect(await coffre.etat('nas')).toBe('session');
    await expect(stat(fichier)).rejects.toThrow();

    // Au lancement suivant (nouvelle instance), le secret a disparu.
    expect(await new SecretStore(fichier, fauxChiffre(false)).lire('nas')).toBeNull();
  });

  it("ne lit pas un secret enregistré auparavant si le trousseau n'est plus là", async () => {
    await new SecretStore(fichier, fauxChiffre(true)).enregistrer('nas', 'secret');
    expect(await new SecretStore(fichier, fauxChiffre(false)).lire('nas')).toBeNull();
  });
});
