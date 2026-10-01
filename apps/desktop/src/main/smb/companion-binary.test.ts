import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CompanionProcess, lanceurDeBinaire } from './companion-process';
import { CompanionRemoteFs } from './companion-remote-fs';

// Test du vrai binaire, sans NAS : il vérifie que le main et le compagnon se
// comprennent. Ignoré tant que le binaire n'a pas été compilé (npm run build:companion).
const binaire = join(import.meta.dirname, '../../../resources/bin/smb-companion');

describe.skipIf(!existsSync(binaire))('binaire compagnon réel', () => {
  it('refuse une opération sans session', async () => {
    const processus = new CompanionProcess(lanceurDeBinaire(binaire));
    await expect(processus.envoyer({ op: 'lire', chemin: 'page.md' })).rejects.toMatchObject({ code: 'non_connecte' });
    processus.arreter();
  });

  it("rapporte un NAS injoignable et des identifiants invalides avec le bon code", async () => {
    const injoignable = new CompanionRemoteFs(new CompanionProcess(lanceurDeBinaire(binaire)), {
      hote: '127.0.0.1',
      partage: 'partage',
      utilisateur: 'utilisateur',
      motDePasse: 'sans importance',
    });
    await expect(injoignable.lister('')).rejects.toMatchObject({ code: 'injoignable' });
    injoignable.fermer();

    const invalide = new CompanionRemoteFs(new CompanionProcess(lanceurDeBinaire(binaire)), {
      hote: 'hote avec espace',
      partage: 'partage',
      utilisateur: 'utilisateur',
      motDePasse: 'sans importance',
    });
    await expect(invalide.ouvrir()).rejects.toMatchObject({ code: 'requete_invalide' });
    invalide.fermer();
  });
});
