import { contextBridge, ipcRenderer } from 'electron';
import { canaux } from '../shared/ipc-contract';
import type { NotesApi } from '../shared/ipc-contract';

// Seule surface offerte au renderer : des fonctions nommées, jamais ipcRenderer lui-même.
const api: NotesApi = {
  version: () => ipcRenderer.invoke(canaux.version),
  lireEtatNas: () => ipcRenderer.invoke(canaux.lireEtatNas),
  enregistrerNas: (saisie) => ipcRenderer.invoke(canaux.enregistrerNas, saisie),
  oublierMotDePasse: () => ipcRenderer.invoke(canaux.oublierMotDePasse),
  testerConnexion: () => ipcRenderer.invoke(canaux.testerConnexion),
};

contextBridge.exposeInMainWorld('notes', api);
