import { contextBridge, ipcRenderer } from 'electron';
import { canaux, evenements } from '../shared/ipc-contract';
import type { AiProgress } from '../shared/ai-contract';
import type { NotesApi, SpellcheckState, SyncStatus } from '../shared/ipc-contract';

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
  listerMentionsCassees: () => ipcRenderer.invoke(canaux.listerMentionsCassees),
  changerIcone: (demande) => ipcRenderer.invoke(canaux.changerIcone, demande),
  ajouterIconeImage: (demande) => ipcRenderer.invoke(canaux.ajouterIconeImage, demande),
  deplacerPage: (demande) => ipcRenderer.invoke(canaux.deplacerPage, demande),
  deplacerPages: (demande) => ipcRenderer.invoke(canaux.deplacerPages, demande),
  dupliquerPage: (demande) => ipcRenderer.invoke(canaux.dupliquerPage, demande),
  supprimerPageVide: (demande) => ipcRenderer.invoke(canaux.supprimerPageVide, demande),
  importer: (demande) => ipcRenderer.invoke(canaux.importer, demande),
  lirePage: (demande) => ipcRenderer.invoke(canaux.lirePage, demande),
  enregistrerPage: (demande) => ipcRenderer.invoke(canaux.enregistrerPage, demande),
  listerConflits: (demande) => ipcRenderer.invoke(canaux.listerConflits, demande),
  lireConflit: (demande) => ipcRenderer.invoke(canaux.lireConflit, demande),
  resoudreConflit: (demande) => ipcRenderer.invoke(canaux.resoudreConflit, demande),
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
  pagesEnAttente: (demande) => ipcRenderer.invoke(canaux.pagesEnAttente, demande),

  etatDuFond: () => ipcRenderer.invoke(canaux.etatDuFond),
  definirDemarrageAuto: (actif) => ipcRenderer.invoke(canaux.definirDemarrageAuto, actif),
  quitterNotes: () => ipcRenderer.invoke(canaux.quitterNotes),
  miseAJourEnAttente: () => ipcRenderer.invoke(canaux.miseAJourEnAttente),
  surMiseAJourInstallee: (ecouteur) => {
    const relais = (): void => ecouteur();
    ipcRenderer.on(evenements.miseAJourInstallee, relais);
    return () => ipcRenderer.removeListener(evenements.miseAJourInstallee, relais);
  },
  relancerNotes: () => ipcRenderer.invoke(canaux.relancerNotes),
  surRechercheMontree: (ecouteur) => {
    const relais = (): void => ecouteur();
    ipcRenderer.on(evenements.rechercheMontree, relais);
    return () => ipcRenderer.removeListener(evenements.rechercheMontree, relais);
  },
  surRechercheCachee: (ecouteur) => {
    const relais = (): void => ecouteur();
    ipcRenderer.on(evenements.rechercheCachee, relais);
    return () => ipcRenderer.removeListener(evenements.rechercheCachee, relais);
  },
  choisirDepuisLaRecherche: (demande) => ipcRenderer.invoke(canaux.choisirDepuisLaRecherche, demande),
  fermerLaRecherche: () => ipcRenderer.invoke(canaux.fermerLaRecherche),
  ajusterLaRecherche: (demande) => ipcRenderer.invoke(canaux.ajusterLaRecherche, demande),
  prendrePageDemandee: () => ipcRenderer.invoke(canaux.prendrePageDemandee),
  surPageDemandee: (ecouteur) => {
    const relais = (): void => ecouteur();
    ipcRenderer.on(evenements.pageDemandee, relais);
    return () => ipcRenderer.removeListener(evenements.pageDemandee, relais);
  },

  surEtatSync: (ecouteur) => {
    const relais = (_evenement: unknown, etat: SyncStatus): void => ecouteur(etat);
    ipcRenderer.on(evenements.etatSyncModifie, relais);
    return () => ipcRenderer.removeListener(evenements.etatSyncModifie, relais);
  },
  etatVerrou: (demande) => ipcRenderer.invoke(canaux.etatVerrou, demande),
  prendreVerrou: (demande) => ipcRenderer.invoke(canaux.prendreVerrou, demande),
  quitterPage: (demande) => ipcRenderer.invoke(canaux.quitterPage, demande),
  choisirImages: () => ipcRenderer.invoke(canaux.choisirImages),
  ajouterImage: (demande) => ipcRenderer.invoke(canaux.ajouterImage, demande),
  telechargerImage: (demande) => ipcRenderer.invoke(canaux.telechargerImage, demande),
  listerImagesAConvertir: () => ipcRenderer.invoke(canaux.listerImagesAConvertir),
  lireImage: (demande) => ipcRenderer.invoke(canaux.lireImage, demande),
  convertirImage: (demande) => ipcRenderer.invoke(canaux.convertirImage, demande),
  listerImagesOrphelines: () => ipcRenderer.invoke(canaux.listerImagesOrphelines),
  retirerLeFond: (demande) => ipcRenderer.invoke(canaux.retirerLeFond, demande),
  copierImage: (demande) => ipcRenderer.invoke(canaux.copierImage, demande),
  apercuDuSite: (demande) => ipcRenderer.invoke(canaux.apercuDuSite, demande),
  enregistrerFavicon: (demande) => ipcRenderer.invoke(canaux.enregistrerFavicon, demande),
  montrerFichier: (demande) => ipcRenderer.invoke(canaux.montrerFichier, demande),
  exporter: (demande) => ipcRenderer.invoke(canaux.exporter, demande),
  montrerExport: (demande) => ipcRenderer.invoke(canaux.montrerExport, demande),
  lireImageDExport: (demande) => ipcRenderer.invoke(canaux.lireImageDExport, demande),

  mettreALaCorbeille: (demande) => ipcRenderer.invoke(canaux.mettreALaCorbeille, demande),
  mettreImageALaCorbeille: (demande) => ipcRenderer.invoke(canaux.mettreImageALaCorbeille, demande),
  listerCorbeille: () => ipcRenderer.invoke(canaux.listerCorbeille),
  apercuCorbeille: (demande) => ipcRenderer.invoke(canaux.apercuCorbeille, demande),
  restaurerDeLaCorbeille: (demande) => ipcRenderer.invoke(canaux.restaurerDeLaCorbeille, demande),
  supprimerDeLaCorbeille: (demande) => ipcRenderer.invoke(canaux.supprimerDeLaCorbeille, demande),
  viderCorbeille: () => ipcRenderer.invoke(canaux.viderCorbeille),

  etatCorrection: () => ipcRenderer.invoke(canaux.etatCorrection),
  surEtatCorrection: (ecouteur) => {
    const relais = (_evenement: unknown, etat: SpellcheckState): void => ecouteur(etat);
    ipcRenderer.on(evenements.etatCorrectionModifie, relais);
    return () => ipcRenderer.removeListener(evenements.etatCorrectionModifie, relais);
  },
  installerCorrection: () => ipcRenderer.invoke(canaux.installerCorrection),
  annulerInstallationCorrection: () => ipcRenderer.invoke(canaux.annulerInstallationCorrection),
  desinstallerCorrection: () => ipcRenderer.invoke(canaux.desinstallerCorrection),
  relancerCorrection: () => ipcRenderer.invoke(canaux.relancerCorrection),
  chercherMiseAJourCorrection: () => ipcRenderer.invoke(canaux.chercherMiseAJourCorrection),
  verifierOrthographe: (demande) => ipcRenderer.invoke(canaux.verifierOrthographe, demande),
  lireDictionnaire: () => ipcRenderer.invoke(canaux.lireDictionnaire),
  ajouterAuDictionnaire: (demande) => ipcRenderer.invoke(canaux.ajouterAuDictionnaire, demande),
  lireIgnores: () => ipcRenderer.invoke(canaux.lireIgnores),
  ignorerRemarque: (demande) => ipcRenderer.invoke(canaux.ignorerRemarque, demande),

  etatIa: () => ipcRenderer.invoke(canaux.etatIa),
  enregistrerReglagesIa: (reglages) => ipcRenderer.invoke(canaux.enregistrerReglagesIa, reglages),
  enregistrerCleLitellm: (demande) => ipcRenderer.invoke(canaux.enregistrerCleLitellm, demande),
  oublierCleLitellm: () => ipcRenderer.invoke(canaux.oublierCleLitellm),
  estimerIa: (demande) => ipcRenderer.invoke(canaux.estimerIa, demande),
  lancerIa: (demande) => ipcRenderer.invoke(canaux.lancerIa, demande),
  annulerIa: () => ipcRenderer.invoke(canaux.annulerIa),
  surAvancementIa: (ecouteur) => {
    const relais = (_evenement: unknown, avancement: AiProgress): void => ecouteur(avancement);
    ipcRenderer.on(evenements.avancementIa, relais);
    return () => ipcRenderer.removeListener(evenements.avancementIa, relais);
  },
  historiqueIa: () => ipcRenderer.invoke(canaux.historiqueIa),
  surHistoriqueIa: (ecouteur) => {
    const relais = (): void => ecouteur();
    ipcRenderer.on(evenements.historiqueIaModifie, relais);
    return () => ipcRenderer.removeListener(evenements.historiqueIaModifie, relais);
  },
};

contextBridge.exposeInMainWorld('notes', api);
