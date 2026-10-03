import { contextBridge, ipcRenderer } from 'electron';
import { canaux, evenements } from '../shared/ipc-contract';
import type { NotesApi, SyncStatus } from '../shared/ipc-contract';

// Seule surface offerte au renderer : des fonctions nommées, jamais ipcRenderer lui-même.
const api: NotesApi = {
  version: () => ipcRenderer.invoke(canaux.version),

  reduireFenetre: () => ipcRenderer.invoke(canaux.reduireFenetre),
  basculerAgrandissementFenetre: () => ipcRenderer.invoke(canaux.basculerAgrandissementFenetre),
  fermerFenetre: () => ipcRenderer.invoke(canaux.fermerFenetre),
  fenetreEstAgrandie: () => ipcRenderer.invoke(canaux.fenetreEstAgrandie),
  surFenetreAgrandie: (ecouteur) => {
    const relais = (_evenement: unknown, agrandie: unknown): void => ecouteur(agrandie === true);
    ipcRenderer.on(evenements.fenetreAgrandie, relais);
    return () => ipcRenderer.removeListener(evenements.fenetreAgrandie, relais);
  },

  surFermetureDemandee: (ecouteur) => {
    const relais = (): void => ecouteur();
    ipcRenderer.on(evenements.fermetureDemandee, relais);
    return () => ipcRenderer.removeListener(evenements.fermetureDemandee, relais);
  },
  confirmerFermeture: () => ipcRenderer.invoke(canaux.confirmerFermeture),

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
  lirePage: (demande) => ipcRenderer.invoke(canaux.lirePage, demande),
  enregistrerPage: (demande) => ipcRenderer.invoke(canaux.enregistrerPage, demande),
  lireTheme: () => ipcRenderer.invoke(canaux.lireTheme),
  creerTheme: () => ipcRenderer.invoke(canaux.creerTheme),
  ouvrirTheme: () => ipcRenderer.invoke(canaux.ouvrirTheme),
  enregistrerTheme: (theme) => ipcRenderer.invoke(canaux.enregistrerTheme, theme),
  surVaultModifie: (ecouteur) => {
    const relais = (): void => ecouteur();
    ipcRenderer.on(evenements.vaultModifie, relais);
    return () => ipcRenderer.removeListener(evenements.vaultModifie, relais);
  },

  lireEtatSync: () => ipcRenderer.invoke(canaux.lireEtatSync),
  synchroniserMaintenant: () => ipcRenderer.invoke(canaux.synchroniserMaintenant),
  surEtatSync: (ecouteur) => {
    const relais = (_evenement: unknown, etat: SyncStatus): void => ecouteur(etat);
    ipcRenderer.on(evenements.etatSyncModifie, relais);
    return () => ipcRenderer.removeListener(evenements.etatSyncModifie, relais);
  },
  etatVerrou: (demande) => ipcRenderer.invoke(canaux.etatVerrou, demande),
  prendreVerrou: (demande) => ipcRenderer.invoke(canaux.prendreVerrou, demande),
  montrerFichier: (demande) => ipcRenderer.invoke(canaux.montrerFichier, demande),
};

contextBridge.exposeInMainWorld('notes', api);
