import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { extensionsDImage } from '@notes/core';
import { BrowserWindow, app, dialog, net, session, shell } from 'electron';
import { evenements } from '../shared/ipc-contract';
import { declarerSchemaDesImages, servirLesImages } from './images/asset-protocol';
import { telechargerImage } from './images/download';
import { creerHandlersImages } from './ipc/images';
import { cleMotDePasse, creerHandlersNas } from './ipc/nas';
import { enregistrerCanaux } from './ipc/register';
import { creerHandlersTheme } from './ipc/theme';
import { creerHandlersVault } from './ipc/vault';
import { creerHandlersSync } from './ipc/sync';
import { creerHandlersFenetre } from './ipc/window';
import { chiffreSafeStorage } from './secrets/safe-storage-cipher';
import { SecretStore } from './secrets/secret-store';
import { durcirContenu, durcirSession } from './security/window-security';
import { SettingsStore } from './settings/settings-store';
import { CompanionProcess, lanceurDeBinaire } from './smb/companion-process';
import { CompanionRemoteFs } from './smb/companion-remote-fs';
import { identiteDuPoste } from './sync/device';
import { IndexFile } from './sync/index-file';
import { SyncScheduler } from './sync/scheduler';
import { creerFileDAttente } from './vault/serial-queue';
import { VaultService } from './vault/vault-service';

const urlDeveloppement = app.isPackaged ? undefined : process.env['ELECTRON_RENDERER_URL'];
const fichierRenderer = join(import.meta.dirname, '../renderer/index.html');
const urlApplication = urlDeveloppement ?? pathToFileURL(fichierRenderer).href;

/** Le binaire compagnon est livré avec l'application, jamais cherché sur le système. */
function cheminCompagnon(): string {
  const dossierRessources = app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources');
  return join(dossierRessources, 'bin', 'smb-companion');
}

let fenetre: BrowserWindow | null = null;

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

function creerFenetre(handlers: ReturnType<typeof creerHandlersFenetre>): void {
  fenetre = new BrowserWindow({
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
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  durcirContenu(fenetre.webContents, urlApplication);
  fenetre.once('ready-to-show', () => fenetre?.show());
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

  if (urlDeveloppement !== undefined) {
    void fenetre.loadURL(urlDeveloppement);
  } else {
    void fenetre.loadFile(fichierRenderer);
  }
}

app.enableSandbox();
declarerSchemaDesImages();

// Une application installée ne doit pas pouvoir être pilotée de l'extérieur par le port de débogage de Chromium.
if (app.isPackaged) {
  app.commandLine.removeSwitch('remote-debugging-port');
  app.commandLine.removeSwitch('remote-debugging-pipe');
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (fenetre !== null) {
      if (fenetre.isMinimized()) {
        fenetre.restore();
      }
      fenetre.focus();
    }
  });

  void app.whenReady().then(async () => {
    durcirSession(session.defaultSession, urlDeveloppement !== undefined);

    const donnees = app.getPath('userData');
    const reglages = new SettingsStore(join(donnees, 'settings.json'));
    // Toute modification du dossier des notes est montrée au renderer et part au NAS peu après (README §5).
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
    // Dernier cycle à la fermeture (README §5) : la fenêtre est déjà fermée, l'application attend la fin de la sync.
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

    const handlersVault = creerHandlersVault({ vault, file: fileDuVault, choisirDossier: () => choisirDossierVault(vault.etat().dossierPropose) });
    const handlersFenetre = creerHandlersFenetre(() => fenetre, handlersVault.attendre);
    enregistrerCanaux({
      fenetre: handlersFenetre,
      vault: handlersVault,
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
      images: creerHandlersImages({
        vault,
        enSerie: handlersVault.enSerie,
        choisirFichiers: choisirImages,
        // Une session à part, sans cookies ni cache partagés avec la fenêtre.
        telecharger: (adresse) => telechargerImage(adresse, (url, options) => session.fromPartition('telechargements-images').fetch(url, options)),
      }),
      expediteurAutorise: (evenement) =>
        fenetre !== null &&
        evenement.senderFrame === fenetre.webContents.mainFrame &&
        evenement.senderFrame.url.startsWith(urlApplication),
    });

    creerFenetre(handlersFenetre);
    sync.demarrer();
  });

  app.on('window-all-closed', () => app.quit());
}
