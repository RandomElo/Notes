import { validerReglagesNas } from '@notes/core';
import type { NasSettings } from '@notes/core';
import type { ConnectionTestResult, NasSaveResult, NasState } from '../../shared/ipc-contract';
import type { SecretStore } from '../secrets/secret-store';
import type { SettingsStore } from '../settings/settings-store';
import { testerConnexion } from '../smb/connection-test';
import type { TestableConnection } from '../smb/connection-test';
import type { CompanionCredentials } from '../smb/protocol';

export const cleMotDePasse = 'nas.motDePasse';
const longueurMaxMotDePasse = 1024;

export interface NasHandlersDependencies {
  reglages: SettingsStore;
  secrets: SecretStore;
  creerConnexion: (identifiants: CompanionCredentials) => TestableConnection;
  /** Réglages ou mot de passe changés : la sync repart sur une connexion neuve. */
  surChangement?: () => void;
}

/** Handlers des canaux « nas: ». Les entrées viennent du renderer : rien n'est supposé valide. */
export function creerHandlersNas(dependances: NasHandlersDependencies) {
  const { reglages, secrets, creerConnexion, surChangement } = dependances;
  let testEnCours = false;

  const lireEtat = async (): Promise<NasState> => ({
    reglages: (await reglages.lire()).nas,
    motDePasse: await secrets.etat(cleMotDePasse),
    stockageChiffre: secrets.stockageChiffre(),
  });

  const enregistrer = async (saisie: unknown): Promise<NasSaveResult> => {
    const validation = validerReglagesNas(saisie);
    const motDePasse = extraireMotDePasse(saisie);
    const erreurs: Extract<NasSaveResult, { ok: false }>['erreurs'] = validation.ok ? {} : { ...validation.erreurs };

    if (motDePasse === 'invalide') {
      erreurs.motDePasse = 'Mot de passe illisible ou trop long.';
    } else if (motDePasse === null && (await secrets.etat(cleMotDePasse)) === 'absent') {
      erreurs.motDePasse = 'Saisis le mot de passe du NAS.';
    }
    if (!validation.ok || Object.keys(erreurs).length > 0) {
      return { ok: false, erreurs };
    }

    if (typeof motDePasse === 'string') {
      await secrets.enregistrer(cleMotDePasse, motDePasse);
    }
    await reglages.ecrire({ ...(await reglages.lire()), nas: validation.valeur });
    surChangement?.();
    return { ok: true, etat: await lireEtat() };
  };

  const oublierMotDePasse = async (): Promise<NasState> => {
    await secrets.oublier(cleMotDePasse);
    surChangement?.();
    return lireEtat();
  };

  const tester = async (): Promise<ConnectionTestResult> => {
    if (testEnCours) {
      return echecConfiguration('Un test est déjà en cours.');
    }
    const nas: NasSettings | null = (await reglages.lire()).nas;
    if (nas === null) {
      return echecConfiguration("Enregistre d'abord les réglages du NAS.");
    }
    const motDePasse = await secrets.lire(cleMotDePasse);
    if (motDePasse === null) {
      return echecConfiguration('Le mot de passe du NAS est à saisir.');
    }
    testEnCours = true;
    try {
      const connexion = creerConnexion({
        hote: nas.hote,
        partage: nas.partage,
        utilisateur: nas.utilisateur,
        motDePasse,
      });
      return await testerConnexion(connexion, nas.dossierVault);
    } finally {
      testEnCours = false;
    }
  };

  return { lireEtat, enregistrer, oublierMotDePasse, tester };
}

/** null : pas de nouveau mot de passe, l'ancien est gardé. */
function extraireMotDePasse(saisie: unknown): string | null | 'invalide' {
  if (typeof saisie !== 'object' || saisie === null || !('motDePasse' in saisie)) {
    return null;
  }
  const valeur = (saisie as { motDePasse: unknown }).motDePasse;
  if (valeur === undefined || valeur === '') {
    return null;
  }
  if (typeof valeur !== 'string' || valeur.length > longueurMaxMotDePasse) {
    return 'invalide';
  }
  return valeur;
}

function echecConfiguration(message: string): ConnectionTestResult {
  return { ok: false, etapes: [], erreur: { code: 'configuration', message } };
}
