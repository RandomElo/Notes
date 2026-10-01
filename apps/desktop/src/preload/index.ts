import { contextBridge, ipcRenderer } from 'electron';
import { canaux, evenements } from '../shared/ipc-contract';
import type { NotesApi } from '../shared/ipc-contract';

// Seule surface offerte au renderer : des fonctions nommées, jamais ipcRenderer lui-même.
const api: NotesApi = {
  version: () => ipcRenderer.invoke(canaux.version),
  lireEtatNas: () => ipcRenderer.invoke(canaux.lireEtatNas),
  enregistrerNas: (saisie) => ipcRenderer.invoke(canaux.enregistrerNas, saisie),
  oublierMotDePasse: () => ipcRenderer.invoke(canaux.oublierMotDePasse),
  testerConnexion: () => ipcRenderer.invoke(canaux.testerConnexion),

  etatVault: () => ipcRenderer.invoke(canaux.etatVault),
  choisirDossierVault: () => ipcRenderer.invoke(canaux.choisirDossierVault),
  utiliserDossierPropose: () => ipcRenderer.invoke(canaux.utiliserDossierPropose),
  lireArbre: () => ipcRenderer.invoke(canaux.lireArbre),
  creerPage: (demande) => ipcRenderer.invoke(canaux.creerPage, demande),
  renommerPage: (demande) => ipcRenderer.invoke(canaux.renommerPage, demande),
  deplacerPage: (demande) => ipcRenderer.invoke(canaux.deplacerPage, demande),
  dupliquerPage: (demande) => ipcRenderer.invoke(canaux.dupliquerPage, demande),
  importer: (demande) => ipcRenderer.invoke(canaux.importer, demande),
  surVaultModifie: (ecouteur) => {
    const relais = (): void => ecouteur();
    ipcRenderer.on(evenements.vaultModifie, relais);
    return () => ipcRenderer.removeListener(evenements.vaultModifie, relais);
  },
};

contextBridge.exposeInMainWorld('notes', api);
