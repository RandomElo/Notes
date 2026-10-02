import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BrowserWindow, app, dialog, session, shell } from 'electron';
import { evenements } from '../shared/ipc-contract';
import { creerHandlersNas } from './ipc/nas';
import { enregistrerCanaux } from './ipc/register';
import { creerHandlersTheme } from './ipc/theme';
import { creerHandlersVault } from './ipc/vault';
import { creerHandlersFenetre } from './ipc/window';
import { chiffreSafeStorage } from './secrets/safe-storage-cipher';
import { SecretStore } from './secrets/secret-store';
import { durcirContenu, durcirSession } from './security/window-security';
import { SettingsStore } from './settings/settings-store';
import { CompanionProcess, lanceurDeBinaire } from './smb/companion-process';
import { CompanionRemoteFs } from './smb/companion-remote-fs';
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
    const vault = new VaultService(reglages, () => fenetre?.webContents.send(evenements.vaultModifie));
    await vault.demarrer();
    app.on('will-quit', () => vault.arreter());

    const lancerCompagnon = lanceurDeBinaire(cheminCompagnon());
    const handlersVault = creerHandlersVault({ vault, choisirDossier: () => choisirDossierVault(vault.etat().dossierPropose) });
    const handlersFenetre = creerHandlersFenetre(() => fenetre, handlersVault.attendre);
    enregistrerCanaux({
      fenetre: handlersFenetre,
      vault: handlersVault,
      theme: creerHandlersTheme({ vault, ouvrirFichier: (chemin) => shell.openPath(chemin) }),
      nas: creerHandlersNas({
        reglages,
        secrets: new SecretStore(join(donnees, 'secrets.enc'), chiffreSafeStorage),
        creerConnexion: (identifiants) => new CompanionRemoteFs(new CompanionProcess(lancerCompagnon), identifiants),
      }),
      expediteurAutorise: (evenement) =>
        fenetre !== null &&
        evenement.senderFrame === fenetre.webContents.mainFrame &&
        evenement.senderFrame.url.startsWith(urlApplication),
    });

    creerFenetre(handlersFenetre);
  });

  app.on('window-all-closed', () => app.quit());
}
