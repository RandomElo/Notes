import { app, ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { canaux } from '../../shared/ipc-contract';
import type { creerHandlersNas } from './nas';
import type { creerHandlersVault } from './vault';

export interface IpcDependencies {
  nas: ReturnType<typeof creerHandlersNas>;
  vault: ReturnType<typeof creerHandlersVault>;
  /** Vrai si l'appel vient bien de la page de l'application. */
  expediteurAutorise: (evenement: IpcMainInvokeEvent) => boolean;
}

/** Branche chaque canal du contrat sur son handler, derrière le contrôle de l'expéditeur. */
export function enregistrerCanaux({ nas, vault, expediteurAutorise }: IpcDependencies): void {
  const brancher = (canal: string, handler: (...arguments_: unknown[]) => unknown): void => {
    ipcMain.handle(canal, (evenement, ...arguments_) => {
      if (!expediteurAutorise(evenement)) {
        throw new Error('Appel refusé.');
      }
      return handler(...arguments_);
    });
  };

  brancher(canaux.version, () => app.getVersion());
  brancher(canaux.lireEtatNas, () => nas.lireEtat());
  brancher(canaux.enregistrerNas, (saisie) => nas.enregistrer(saisie));
  brancher(canaux.oublierMotDePasse, () => nas.oublierMotDePasse());
  brancher(canaux.testerConnexion, () => nas.tester());

  brancher(canaux.etatVault, () => vault.etat());
  brancher(canaux.choisirDossierVault, () => vault.choisirDossier());
  brancher(canaux.utiliserDossierPropose, () => vault.utiliserDossierPropose());
  brancher(canaux.lireArbre, () => vault.lireArbre());
  brancher(canaux.creerPage, (demande) => vault.creerPage(demande));
  brancher(canaux.renommerPage, (demande) => vault.renommerPage(demande));
  brancher(canaux.deplacerPage, (demande) => vault.deplacerPage(demande));
  brancher(canaux.dupliquerPage, (demande) => vault.dupliquerPage(demande));
  brancher(canaux.importer, (demande) => vault.importer(demande));
}
