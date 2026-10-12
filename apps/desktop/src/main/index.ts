import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { extensionsDImage } from '@notes/core';
import { BrowserWindow, app, dialog, net, session, shell } from 'electron';
import { evenements } from '../shared/ipc-contract';
import { imprimerEnPdf } from './export/pdf';
import { declarerSchemaDesImages, lireImageDuVault, servirLesImages } from './images/asset-protocol';
import { telechargerImage } from './images/download';
import { BackgroundRemoval } from './images/background-removal';
import { creerHandlersExport } from './ipc/export';
import { creerHandlersImages } from './ipc/images';
import { creerHandlersLiens } from './ipc/links';
import { apercuDuSite } from './links/site-preview';
import { cleMotDePasse, creerHandlersNas } from './ipc/nas';
import { enregistrerCanaux } from './ipc/register';
import { creerHandlersTheme } from './ipc/theme';
import { creerHandlersCorrection } from './ipc/spellcheck';
import { creerHandlersCorbeille } from './ipc/trash';
import { creerHandlersVault } from './ipc/vault';
import { creerHandlersDepotMarkdown } from './ipc/markdown-drop';
import { creerHandlersSync } from './ipc/sync';
import { creerHandlersFenetre } from './ipc/window';
import { chiffreSafeStorage } from './secrets/safe-storage-cipher';
import { SecretStore } from './secrets/secret-store';
import { durcirContenu, durcirSession } from './security/window-security';
import { SettingsStore } from './settings/settings-store';
import { AiService, ancienneCleLitellm } from './ai/ai-service';
import { carteRetenue, detecterCartes, sourcesDuPoste } from './ai/hardware';
import { creerHandlersMemos } from './ipc/memos';
import { convertirEnWav, dureeAudio } from './audio/ffmpeg';
import { dossierDeWhisper } from './whisper/model';
import { TranscriptionMeasures } from './whisper/timing';
import { WhisperService } from './whisper/whisper-service';
import type { GpuInfo } from './ai/hardware';
import { CompanionProcess, lanceurDeBinaire } from './smb/companion-process';
import { CompanionRemoteFs } from './smb/companion-remote-fs';
import { identiteDuPoste } from './sync/device';
import { IndexFile } from './sync/index-file';
import { SyncScheduler } from './sync/scheduler';
import { pageDemandee, sansPage } from './launch/page-argument';
import { attendreLaFinDeLAncienne, relancerApresLaFin } from './update/relaunch';
import { UpdateWatcher } from './update/update-watcher';
import { cheminDuDemarrage } from './languagetool/launcher';
import { dossierDeLanguageTool } from './languagetool/location';
import { SpellcheckService } from './languagetool/spellcheck-service';
import { creerFileDAttente } from './vault/serial-queue';
import { VaultService } from './vault/vault-service';

const urlDeveloppement = app.isPackaged ? undefined : process.env['ELECTRON_RENDERER_URL'];
const fichierRenderer = join(import.meta.dirname, '../renderer/index.html');
const urlApplication = urlDeveloppement ?? pathToFileURL(fichierRenderer).href;

/** Ressources livrées avec l'application (compagnon, détourage), jamais cherchées sur le système. */
function dossierRessources(): string {
  return app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources');
}

/** Le binaire compagnon est livré avec l'application, jamais cherché sur le système. */
function cheminCompagnon(): string {
  return join(dossierRessources(), 'bin', 'smb-companion');
}

let fenetre: BrowserWindow | null = null;

const preferencesDesFenetres = {
  preload: join(import.meta.dirname, '../preload/index.cjs'),
  sandbox: true,
  contextIsolation: true,
  nodeIntegration: false,
  webSecurity: true,
};

/** Charge la page de l'application dans une fenêtre, durcie. */
function chargerApplication(cible: BrowserWindow): void {
  durcirContenu(cible.webContents, urlApplication);
  if (urlDeveloppement !== undefined) {
    void cible.loadURL(urlDeveloppement);
  } else {
    void cible.loadFile(fichierRenderer);
  }
}

/**
 * Page demandée par `--page=<id>` (la barre de recherche du poste), au
 * lancement ou par une seconde instance : le renderer la prend au démarrage
 * et à chaque avis, si bien qu'une demande arrivée avant son chargement
 * n'est pas perdue.
 */
let pageEnAttente = pageDemandee(process.argv);
function demanderPage(id: string): void {
  pageEnAttente = id;
  fenetre?.webContents.send(evenements.pageDemandee);
}
/** Ramène la fenêtre principale. Branchée une fois l'application prête. */
let ouvrirFenetrePrincipale = (): void => undefined;
/** Une nouvelle version a remplacé l'AppImage (`npm run installer`) : relancer dès que possible. */
let miseAJourInstallee = false;

/**
 * Quitte : la fenêtre principale enregistre d'abord sa page, puis
 * l'application s'arrête (fermer la fenêtre quitte Notes, choix d'Eloi du
 * 2026-10-12). Avec « relancer », elle redémarre sur la nouvelle version.
 */
function quitterNotes(relancer = false): void {
  const appImage = process.env['APPIMAGE'];
  if (relancer && appImage !== undefined && appImage !== '') {
    // Mêmes arguments qu'au lancement (profil, etc.), sans la page demandée : les onglets sont retrouvés.
    // Hors AppImage, Electron reçoit en plus le dossier de l'application, qui n'est pas un argument de l'utilisateur.
    relancerApresLaFin(appImage, sansPage(process.argv.slice(app.isPackaged ? 1 : 2)));
  }
  if (fenetre === null) {
    app.quit();
  } else {
    fenetre.close();
  }
}

/** Ramène la fenêtre au premier plan, même réduite ou derrière une autre. */
function ramenerFenetre(): void {
  if (fenetre === null) {
    return;
  }
  if (fenetre.isMinimized()) {
    fenetre.restore();
  }
  fenetre.show();
  fenetre.moveTop();
  fenetre.focus();
}

/** Sélecteur de dossier du système pour le vault. null si l'utilisateur annule. */
async function choisirDossierVault(dossierPropose: string): Promise<string | null> {
  if (fenetre === null) {
    return null;
  }
  const choix = await dialog.showOpenDialog(fenetre, {
    title: 'Dossier des notes',
    defaultPath: dossierPropose,
    buttonLabel: 'Choisir ce dossier',
    properties: ['openDirectory', 'createDirectory'],
  });
  return choix.canceled ? null : (choix.filePaths[0] ?? null);
}

/** Sélecteur de fichiers du système pour insérer des images. Liste vide si l'utilisateur annule. */
async function choisirImages(): Promise<string[]> {
  if (fenetre === null) {
    return [];
  }
  const choix = await dialog.showOpenDialog(fenetre, {
    title: 'Insérer une image',
    buttonLabel: 'Insérer',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Images', extensions: extensionsDImage }],
  });
  return choix.canceled ? [] : choix.filePaths;
}

/** Dossier du dernier export, proposé au suivant. Au premier, le dossier Documents. */
let dossierDExport: string | null = null;

/** Boîte « Enregistrer sous » du système pour un export. null si l'utilisateur annule. */
async function choisirDestinationDExport(nomPropose: string, format: { extension: string; libelle: string }): Promise<string | null> {
  if (fenetre === null) {
    return null;
  }
  const choix = await dialog.showSaveDialog(fenetre, {
    title: 'Exporter',
    defaultPath: join(dossierDExport ?? app.getPath('documents'), nomPropose),
    buttonLabel: 'Exporter',
    filters: [{ name: format.libelle, extensions: [format.extension] }],
    properties: ['showOverwriteConfirmation', 'createDirectory'],
  });
  if (choix.canceled || choix.filePath === undefined || choix.filePath === '') {
    return null;
  }
  dossierDExport = dirname(choix.filePath);
  return choix.filePath;
}

/**
 * Fenêtre principale. La fermer l'enregistre, puis quitte Notes.
 */
function creerFenetre(handlers: ReturnType<typeof creerHandlersFenetre>): void {
  handlers.reinitialiser();
  fenetre = new BrowserWindow({
    // Icône de la barre des tâches (docs/spec/packaging.md) ; celle de l'AppImage vient d'electron-builder.
    icon: join(dossierRessources(), 'icon', '256x256.png'),
    width: 1100,
    height: 760,
    minWidth: 720,
    minHeight: 480,
    show: false,
    backgroundColor: '#16171b',
    title: 'Notes',
    // Pas de cadre du système : la barre de titre est dessinée par l'application (features/title-bar).
    frame: false,
    autoHideMenuBar: true,
    webPreferences: preferencesDesFenetres,
  });
  fenetre.once('ready-to-show', () => ramenerFenetre());
  const signalerAgrandissement = (): void => fenetre?.webContents.send(evenements.fenetreAgrandie, fenetre.isMaximized());
  fenetre.on('maximize', signalerAgrandissement);
  fenetre.on('unmaximize', signalerAgrandissement);
  // La fermeture attend que le renderer ait enregistré la page ouverte (voir ipc/window.ts).
  fenetre.on('close', (evenement) => {
    handlers.surDemandeDeFermeture(evenement, () => fenetre?.webContents.send(evenements.fermetureDemandee));
  });
  fenetre.on('closed', () => {
    fenetre = null;
  });

  chargerApplication(fenetre);
}

app.enableSandbox();
declarerSchemaDesImages();

// Une application installée ne doit pas pouvoir être pilotée de l'extérieur par le port de débogage de Chromium.
if (app.isPackaged) {
  app.commandLine.removeSwitch('remote-debugging-port');
  app.commandLine.removeSwitch('remote-debugging-pipe');
}

// Relancée après une mise à jour : l'ancienne instance doit être finie avant de prendre sa place.
void attendreLaFinDeLAncienne(process.env).then(demarrer);

function demarrer(): void {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
  } else {
    app.on('second-instance', (_evenement, argv) => {
      ouvrirFenetrePrincipale();
      const id = pageDemandee(argv);
      if (id !== null) {
        demanderPage(id);
      }
    });

    void app.whenReady().then(async () => {
      durcirSession(session.defaultSession, urlDeveloppement !== undefined);

      const donnees = app.getPath('userData');
      const reglages = new SettingsStore(join(donnees, 'settings.json'));
      // Toute modification du dossier des notes est montrée au renderer et part au NAS peu après (docs/spec/sync.md).
      let surModificationLocale = (): void => undefined;
      const vault = new VaultService(reglages, () => {
        fenetre?.webContents.send(evenements.vaultModifie);
        surModificationLocale();
      });
      await vault.demarrer();
      app.on('will-quit', () => vault.arreter());
      servirLesImages(() => vault.fsOuNull());

      const lancerCompagnon = lanceurDeBinaire(cheminCompagnon());
      const secrets = new SecretStore(join(donnees, 'secrets.enc'), chiffreSafeStorage);
      // LiteLLM est abandonné (2026-10-09) : sa clé, si une version 0.12.x l'avait enregistrée, ne reste pas sur le disque.
      void secrets.oublier(ancienneCleLitellm).catch(() => undefined);
      // Enregistrements de pages et écritures de la sync passent par la même file : aucun ne se glisse entre la vérification et l'écriture de l'autre.
      const fileDuVault = creerFileDAttente();
      const sync = new SyncScheduler({
        reglages,
        enSerie: fileDuVault.enSerie,
        lireMotDePasse: () => secrets.lire(cleMotDePasse),
        localFs: () => vault.fsOuNull(),
        creerConnexion: (identifiants) => new CompanionRemoteFs(new CompanionProcess(lancerCompagnon), identifiants),
        index: new IndexFile(join(donnees, 'cache', 'sync-index.json')),
        appareil: identiteDuPoste(reglages),
        surEtat: (etat) => fenetre?.webContents.send(evenements.etatSyncModifie, etat),
      });
      surModificationLocale = () => sync.signalerModificationLocale();
      // Câble débranché ou wifi coupé : « NAS injoignable » tout de suite, cycle relancé au retour du réseau.
      let enLigne = net.isOnline();
      if (!enLigne) {
        sync.signalerReseau(false);
      }
      const surveillanceReseau = setInterval(() => {
        if (net.isOnline() !== enLigne) {
          enLigne = !enLigne;
          sync.signalerReseau(enLigne);
        }
      }, 1_000);
      app.on('will-quit', () => clearInterval(surveillanceReseau));
      vault.surChangementDeDossier(() => void sync.reconfigurer());
      // Dernier cycle à la fermeture (docs/spec/sync.md) : la fenêtre est déjà fermée, l'application attend la fin de la sync.
      let syncTerminee = false;
      app.on('before-quit', (evenement) => {
        if (syncTerminee) {
          return;
        }
        evenement.preventDefault();
        void sync.arreter().finally(() => {
          syncTerminee = true;
          app.quit();
        });
      });

      const detourage = new BackgroundRemoval(join(dossierRessources(), 'background-removal'));
      app.on('will-quit', () => detourage.arreter());
      // Correction orthographique (docs/spec/correction.md) : LanguageTool installé par Notes à côté de l'AppImage, démarré avec la session.
      // Hors AppImage, NOTES_LANGUAGETOOL_ADRESSE désigne un serveur déjà lancé (essais de bout en bout).
      const adresseExterne = app.isPackaged ? undefined : process.env['NOTES_LANGUAGETOOL_ADRESSE'];
      const brutDeMemoire = app.isPackaged ? undefined : process.env['NOTES_MEMOIRE_ESSAI'];
      const memoireDEssai = brutDeMemoire === undefined || brutDeMemoire === '' ? undefined : Number(brutDeMemoire);
      const correction = new SpellcheckService({
        dossier: dossierDeLanguageTool(process.env, homedir()),
        demarrageDeSession: cheminDuDemarrage(process.env['XDG_CONFIG_HOME'] || join(homedir(), '.config')),
        // Une session à part, sans cookies ni cache partagés avec la fenêtre.
        telecharger: (adresse, signal) => session.fromPartition('telechargements-languagetool').fetch(adresse, { signal }),
        surEtat: (etat) => fenetre?.webContents.send(evenements.etatCorrectionModifie, etat),
        ...(adresseExterne === undefined || adresseExterne === '' ? {} : { adresseExterne }),
        // Hors AppImage, NOTES_MEMOIRE_ESSAI simule un poste à cette mémoire (essais de bout en bout).
        ...(memoireDEssai === undefined ? {} : { capacite: async () => ({ memoire: memoireDEssai, processeurs: 16, libre: null }) }),
      });
      void correction.demarrer();
      // Notes quitte : seule une installation en cours s'arrête, LanguageTool continue pour l'extension du navigateur.
      app.on('will-quit', () => correction.arreter());
      let cartesDuPoste: Promise<GpuInfo[]> | null = null;
      // Hors AppImage, NOTES_CARTES_ESSAI donne une carte imaginaire (essais de bout en bout) : un essai ne dépend pas de la carte du poste.
      const cartesDEssai = (): Promise<GpuInfo[]> | null => {
        const brut = app.isPackaged ? undefined : process.env['NOTES_CARTES_ESSAI'];
        return brut === undefined || brut === '' ? null : Promise.resolve(JSON.parse(brut) as GpuInfo[]);
      };
      // Le nom des cartes vu par Chromium (« AMD Radeon RX 7600 (radeonsi, navi33…) ») : /sys ne le donne pas.
      const nomsDesCartes = async (): Promise<string[]> => {
        const infos = (await app.getGPUInfo('complete')) as { auxAttributes?: { glRenderer?: unknown }; gpuDevice?: Array<{ deviceString?: unknown }> };
        const noms = [infos.auxAttributes?.glRenderer, ...(infos.gpuDevice ?? []).map((carte) => carte.deviceString)];
        return noms.filter((nom): nom is string => typeof nom === 'string' && nom !== '');
      };
      const obtenirCartes = (): Promise<GpuInfo[]> => (cartesDuPoste ??= cartesDEssai() ?? detecterCartes(sourcesDuPoste(nomsDesCartes)));
      // Mémos vocaux (docs/spec/memos.md) : serveur whisper.cpp livré dans l'AppImage, modèle téléchargé à la demande à côté d'elle.
      // Hors AppImage, NOTES_WHISPER_ADRESSE désigne un serveur déjà lancé (essais de bout en bout).
      const adresseWhisper = app.isPackaged ? undefined : process.env['NOTES_WHISPER_ADRESSE'];
      const whisper = new WhisperService({
        dossier: dossierDeWhisper(process.env, homedir()),
        binaire: join(dossierRessources(), 'whisper', 'whisper-server'),
        // Une session à part, sans cookies ni cache partagés avec la fenêtre.
        telecharger: (adresse, signal) => session.fromPartition('telechargements-whisper').fetch(adresse, { signal }),
        surEtat: (etat) => fenetre?.webContents.send(evenements.etatWhisperModifie, etat),
        carte: async () => {
          const carte = carteRetenue(await obtenirCartes());
          return carte?.dediee === true ? carte.nom : null;
        },
        ...(adresseWhisper === undefined || adresseWhisper === '' ? {} : { adresseExterne: adresseWhisper }),
        // Vitesse de transcription propre à ce poste : à côté des réglages, pas dans le dossier des notes.
        mesures: new TranscriptionMeasures(join(donnees, 'transcriptions.json')),
      });
      void whisper.demarrer();
      app.on('will-quit', () => whisper.arreter());
      const handlersVault = creerHandlersVault({ vault, file: fileDuVault, choisirDossier: () => choisirDossierVault(vault.etat().dossierPropose) });
      const handlersFenetre = creerHandlersFenetre(() => fenetre, handlersVault.attendre);
      const handlersCorbeille = creerHandlersCorbeille({ vault, file: fileDuVault, avecNas: (action) => sync.avecNas(action) });
      // Purge de la corbeille au démarrage (docs/spec/corbeille.md) : celle du poste ici, celle du NAS au premier cycle.
      void handlersCorbeille.purgerAuDemarrage();
      vault.surChangementDeDossier(() => void handlersCorbeille.purgerAuDemarrage());
      // Fonctions IA (docs/spec/ia.md) : Ollama sur le poste, modèle choisi selon la carte graphique.
      const ia = new AiService({
        // La carte ne change pas pendant une session : lue une fois, à la première demande.
        cartes: obtenirCartes,
        reglages,
        contexte: () => vault.contexte(),
        enSerie: handlersVault.enSerie,
        surAvancement: (avancement) => fenetre?.webContents.send(evenements.avancementIa, avancement),
        surHistorique: () => fenetre?.webContents.send(evenements.historiqueIaModifie),
        octetsAleatoires: (taille) => randomBytes(taille),
      });
      const ffmpeg = join(dossierRessources(), 'ffmpeg', 'ffmpeg');
      enregistrerCanaux({
        fenetre: handlersFenetre,
        vault: handlersVault,
        depot: creerHandlersDepotMarkdown({ vault, enSerie: handlersVault.enSerie }),
        theme: creerHandlersTheme({ vault, ouvrirFichier: (chemin) => shell.openPath(chemin) }),
        nas: creerHandlersNas({
          reglages,
          secrets,
          creerConnexion: (identifiants) => new CompanionRemoteFs(new CompanionProcess(lancerCompagnon), identifiants),
          surChangement: () => void sync.reconfigurer(),
        }),
        sync: creerHandlersSync({
          sync,
          montrerFichier: (chemin) => {
            const dossier = vault.etat().dossier;
            if (dossier !== null) {
              shell.showItemInFolder(join(dossier, ...chemin.split('/')));
            }
          },
        }),
        // Une session à part, sans cookies ni cache partagés avec la fenêtre, comme pour les images.
        liens: creerHandlersLiens({
          vault,
          enSerie: handlersVault.enSerie,
          apercu: (adresse) => apercuDuSite(adresse, (url, options) => session.fromPartition('apercus-sites').fetch(url, options)),
        }),
        images: creerHandlersImages({
          vault,
          enSerie: handlersVault.enSerie,
          choisirFichiers: choisirImages,
          detourage,
          // Une session à part, sans cookies ni cache partagés avec la fenêtre.
          telecharger: (adresse) => telechargerImage(adresse, (url, options) => session.fromPartition('telechargements-images').fetch(url, options)),
        }),
        exports: creerHandlersExport({
          choisirDestination: choisirDestinationDExport,
          imprimer: imprimerEnPdf,
          ecrire: (chemin, octets) => writeFile(chemin, octets),
          montrer: (chemin) => shell.showItemInFolder(chemin),
          ouvrir: (chemin) => void shell.openPath(chemin),
          lireImage: (chemin) => lireImageDuVault(chemin, vault.fsOuNull()),
        }),
        corbeille: handlersCorbeille,
        correction: creerHandlersCorrection({ correction, vault, enSerie: handlersVault.enSerie }),
        ia,
        memos: creerHandlersMemos({
          vault,
          enSerie: handlersVault.enSerie,
          reglages,
          whisper,
          ia,
          // Décodeur livré dans l'AppImage (scripts/build-ffmpeg.sh), jamais cherché sur le poste.
          convertir: (fichier) => convertirEnWav(ffmpeg, fichier),
          dureeAudio: (fichier) => dureeAudio(ffmpeg, fichier),
          ouvrirDossier: (dossier) => shell.openPath(dossier),
        }),
        lancement: {
          quitter: () => quitterNotes(),
          relancer: () => quitterNotes(true),
          miseAJourEnAttente: () => miseAJourInstallee,
          prendrePage: () => {
            const id = pageEnAttente;
            pageEnAttente = null;
            return id;
          },
        },
        expediteurAutorise: (evenement) =>
          evenement.senderFrame !== null &&
          evenement.senderFrame.url.startsWith(urlApplication) &&
          fenetre !== null &&
          evenement.senderFrame === fenetre.webContents.mainFrame,
      });

      ouvrirFenetrePrincipale = () => {
        if (fenetre === null) {
          creerFenetre(handlersFenetre);
        } else {
          ramenerFenetre();
        }
      };
      ouvrirFenetrePrincipale();
      sync.demarrer();

      // Mise à jour locale : l'AppImage remplacée par `npm run installer`. La barre de titre propose de relancer.
      const appImage = process.env['APPIMAGE'];
      if (appImage !== undefined && appImage !== '') {
        const surveillance = new UpdateWatcher(appImage, () => {
          miseAJourInstallee = true;
          fenetre?.webContents.send(evenements.miseAJourInstallee);
        });
        void surveillance.demarrer().catch(() => undefined);
        app.on('will-quit', () => surveillance.arreter());
      }
    });

    // Fermer la fenêtre quitte Notes (choix d'Eloi, 2026-10-12) ; la sync s'arrête proprement avant (`before-quit`).
    app.on('window-all-closed', () => app.quit());
  }
}
