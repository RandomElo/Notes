import { RemoteFsError, joindreChemins } from '@notes/core';
import type { RemoteFs } from '@notes/core';
import type { ConnectionTestResult, ConnectionTestStep, SessionProtection } from '../../shared/ipc-contract';

/** Ce que le test attend d'une connexion : un RemoteFs qu'on ouvre, qu'on interroge et qu'on ferme. */
export interface TestableConnection extends RemoteFs {
  ouvrir(): Promise<void>;
  infosSession(): Promise<SessionProtection>;
  fermer(): void;
}

/**
 * Preuve que le poste peut travailler sur le NAS : ouvre la session, crée le
 * dossier du vault s'il manque, écrit un fichier, le relit, le supprime, puis
 * vérifie que toutes les réponses du NAS étaient chiffrées.
 */
export async function testerConnexion(
  connexion: TestableConnection,
  dossierVault: string,
  maintenant: () => number = Date.now,
): Promise<ConnectionTestResult> {
  const etapes: ConnectionTestStep[] = [];
  const etape = async <T>(libelle: string, action: () => Promise<T>): Promise<T> => {
    const debut = maintenant();
    const resultat = await action();
    etapes.push({ libelle, dureeMs: maintenant() - debut });
    return resultat;
  };

  const fichier = joindreChemins(dossierVault, `.notes-test-${maintenant()}.txt`);
  const contenu = new TextEncoder().encode('Notes, test de connexion\n');

  try {
    await etape('Connexion et authentification', () => connexion.ouvrir());
    if (dossierVault !== '') {
      await etape('Dossier du vault présent', () => connexion.creerDossier(dossierVault));
    }
    await etape('Écriture du fichier de test', () => connexion.ecrire(fichier, contenu));
    const relu = await etape('Relecture', () => connexion.lire(fichier));
    if (!memeContenu(relu, contenu)) {
      throw new RemoteFsError('interne', 'Le fichier relu ne correspond pas à ce qui a été écrit.');
    }
    await etape('Suppression du fichier de test', () => connexion.supprimer(fichier));

    const protection = await connexion.infosSession();
    if (protection.reponsesTotal === 0 || protection.reponsesChiffrees !== protection.reponsesTotal) {
      throw new RemoteFsError('chiffrement_absent', "Une partie des échanges avec le NAS n'était pas chiffrée.");
    }
    return { ok: true, etapes, protection };
  } catch (erreur) {
    if (erreur instanceof RemoteFsError) {
      return { ok: false, etapes, erreur: { code: erreur.code, message: erreur.message } };
    }
    return { ok: false, etapes, erreur: { code: 'interne', message: 'Erreur inattendue pendant le test.' } };
  } finally {
    connexion.fermer();
  }
}

function memeContenu(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((octet, index) => octet === b[index]);
}
