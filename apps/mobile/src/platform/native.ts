import { App } from '@capacitor/app';
import { AppLauncher } from '@capacitor/app-launcher';
import { SplashScreen } from '@capacitor/splash-screen';
import { CapacitorLocalFs, fichierDeLApplication } from './capacitor-local-fs';
import { dossierDesMemosEnAttente, dossierDuCache } from './environment';
import type { Environnement } from './environment';
import { surOccasionDeSync, reseauPresent } from './network';
import { Recorder, Smb } from './plugins';
import { motDePasseEnregistre, oublierMotDePasse } from './secrets';
import { appel, smbRemoteFs } from './smb-remote-fs';

/** L'environnement du téléphone : stockage privé, plugins SMB et Keystore. */
export function environnementNatif(): Environnement {
  // Filet : même si le premier écran ne vient pas, l'écran de démarrage ne reste pas indéfiniment.
  setTimeout(() => void SplashScreen.hide(), 5000);
  return {
    local: new CapacitorLocalFs(dossierDuCache),
    distant: smbRemoteFs,
    fichiers: fichierDeLApplication,
    connecter: ({ hote, partage, utilisateur }, { hoteTailscale, motDePasse, rouvrir = false }) =>
      appel(() => Smb.connecter(motDePasse === undefined ? { hote, hoteTailscale, partage, utilisateur, rouvrir } : { hote, hoteTailscale, partage, utilisateur, rouvrir, motDePasse })),
    deconnecter: () => Smb.deconnecter(),
    motDePasseEnregistre,
    oublierMotDePasse,
    reseauPresent,
    surOccasionDeSync,
    async ouvrirLien(adresse) {
      if (/^(https?:|mailto:)/i.test(adresse)) {
        await AppLauncher.openUrl({ url: adresse });
      }
    },
    surRetour(rappel) {
      const abonnement = App.addListener('backButton', rappel);
      return () => void abonnement.then((poignee) => poignee.remove());
    },
    quitter: () => void App.exitApp(),
    contenuAffiche: () => void SplashScreen.hide(),
    memosEnAttente: new CapacitorLocalFs(dossierDesMemosEnAttente),
    enregistreur: {
      demarrer: (nom) => Recorder.demarrer({ nom }),
      terminer: async () => (await Recorder.terminer()).nom,
      annuler: () => Recorder.annuler(),
      etat: () => Recorder.etat(),
    },
  };
}
