import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { estId, extensionsDImage } from '@notes/core';
import { BrowserWindow, app, dialog, globalShortcut, net, session, shell } from 'electron';
import { evenements } from '../shared/ipc-contract';
import type { BackgroundState, PageRequest } from '../shared/ipc-contract';
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
import { Autostart, argumentEnFond } from './search/autostart';
import { PendingRequest, demandeLaRecherche } from './search/search-request';
import { SearchWindow } from './search/search-window';
import { attendreLaFinDeLAncienne, relancerApresLaFin } from './update/relaunch';
import { UpdateWatcher } from './update/update-watcher';
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

const preferencesDesFenetres = {
  preload: join(import.meta.dirname, '../preload/index.cjs'),
  sandbox: true,
  contextIsolation: true,
  nodeIntegration: false,
  webSecurity: true,
};

/** Charge la page de l'application, sur sa vue « recherche » pour la petite fenêtre du raccourci global. */
function chargerApplication(cible: BrowserWindow, vue?: 'recherche'): void {
  durcirContenu(cible.webContents, urlApplication);
  if (urlDeveloppement !== undefined) {
    void cible.loadURL(vue === undefined ? urlDeveloppement : `${urlDeveloppement}#${vue}`);
  } else {
    void cible.loadFile(fichierRenderer, vue === undefined ? {} : { hash: vue });
  }
}

/** Raccourci global, capté par l'application tant qu'elle tourne (README §7). */
const raccourciGlobal = { touches: 'Control+Alt+Space', libelle: 'Ctrl+Alt+Espace' };

// Notes reste lancée en fond une fois sa fenêtre fermée, avec la petite fenêtre de recherche prête et cachée :
// le raccourci global l'affiche aussitôt. Une page choisie s'ouvre dans la fenêtre principale.
const pagesDemandees = new PendingRequest<PageRequest>(() => fenetre?.webContents.send(evenements.pageDemandee));
const fenetreDeRecherche = new SearchWindow({
  webPreferences: preferencesDesFenetres,
  charger: (cible) => chargerApplication(cible, 'recherche'),
});
/** `--recherche` : seule la recherche s'affiche. `--fond` (ouverture de session) : rien ne s'affiche. */
const lancement = demandeLaRecherche(process.argv) ? 'recherche' : process.argv.includes(argumentEnFond) ? 'fond' : 'fenetre';
/** Ouvre ou ramène la fenêtre principale, sync reprise. Branchée une fois l'application prête. */
let ouvrirFenetrePrincipale = (): void => undefined;
/** Vrai une fois « Quitter » demandé : la fenêtre qui se ferme arrête alors l'application. */
let quitteDemandee = false;
/** Une nouvelle version a remplacé l'AppImage (`npm run installer`) : relancer dès que possible. */
let miseAJourInstallee = false;

/**
 * Quitte pour de bon : la fenêtre principale enregistre d'abord sa page, puis
 * l'application s'arrête. Avec « relancer », elle redémarre sur la nouvelle
 * version installée, en fond si sa fenêtre était fermée.
 */
function quitterNotes(relancer = false): void {
  quitteDemandee = true;
  const appImage = process.env['APPIMAGE'];
  if (relancer && appImage !== undefined && appImage !== '') {
    // Mêmes arguments qu'au lancement (profil, etc.), sauf ce qui dit quoi afficher : en fond si la fenêtre était fermée.
    // Hors AppImage, Electron reçoit en plus le dossier de l'application, qui n'est pas un argument de l'utilisateur.
    const argumentsDOrigine = process.argv.slice(app.isPackaged ? 1 : 2).filter((argument) => argument !== argumentEnFond && !demandeLaRecherche([argument]));
    relancerApresLaFin(appImage, [...argumentsDOrigine, ...(fenetre === null ? [argumentEnFond] : [])]);
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

/**
 * Fenêtre principale. La fermer l'enregistre et la détruit, mais l'application
 * reste en fond pour la recherche et la sync (sauf « Quitter »).
 */
function creerFenetre(handlers: ReturnType<typeof creerHandlersFenetre>): void {
  handlers.reinitialiser();
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
    if (quitteDemandee) {
      app.quit();
    } else if (miseAJourInstallee) {
      // Fenêtre fermée : rien ne gêne, on passe à la nouvelle version, en fond.
      quitterNotes(true);
    }
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
      if (demandeLaRecherche(argv)) {
        fenetreDeRecherche.ouvrir();
      } else if (!argv.includes(argumentEnFond)) {
        ouvrirFenetrePrincipale();
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

      // Démarrage avec la session : un fichier .desktop écrit seulement quand on le demande dans les réglages.
      const dossierDeConfiguration = process.env['XDG_CONFIG_HOME'] ?? '';
      const demarrageAuto = new Autostart(dossierDeConfiguration === '' ? join(homedir(), '.config') : dossierDeConfiguration, process.env['APPIMAGE']);
      let raccourciActif = false;
      const etatDuFond = async (): Promise<BackgroundState> => ({
        raccourci: raccourciGlobal.libelle,
        raccourciActif,
        demarrageAuto: demarrageAuto.disponible() ? await demarrageAuto.actif() : null,
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
        recherche: {
          etatDuFond: () => etatDuFond(),
          definirDemarrageAuto: async (actif) => {
            if (typeof actif === 'boolean') {
              await demarrageAuto.definir(actif);
            }
            return etatDuFond();
          },
          quitter: () => quitterNotes(),
          relancer: () => quitterNotes(true),
          miseAJourEnAttente: () => miseAJourInstallee,
          choisir: (demande) => {
            const { id, nouvelOnglet } = (typeof demande === 'object' && demande !== null ? demande : {}) as { id?: unknown; nouvelOnglet?: unknown };
            if (typeof id !== 'string' || !estId(id)) {
              return;
            }
            // La fenêtre principale passe devant d'abord : la fenêtre de recherche, en perdant le focus, ne doit pas arrêter l'application.
            pagesDemandees.demander({ id, nouvelOnglet: nouvelOnglet === true });
            ouvrirFenetrePrincipale();
            fenetreDeRecherche.cacher();
          },
          fermer: () => fenetreDeRecherche.cacher(),
          ajuster: (demande) => {
            const hauteur = typeof demande === 'object' && demande !== null ? (demande as { hauteur?: unknown }).hauteur : undefined;
            if (typeof hauteur === 'number') {
              fenetreDeRecherche.ajusterHauteur(hauteur);
            }
          },
          prendrePage: () => pagesDemandees.prendre(),
        },
        expediteurAutorise: (evenement) =>
          evenement.senderFrame !== null &&
          evenement.senderFrame.url.startsWith(urlApplication) &&
          ((fenetre !== null && evenement.senderFrame === fenetre.webContents.mainFrame) || fenetreDeRecherche.estLaPage(evenement.senderFrame)),
      });

      ouvrirFenetrePrincipale = () => {
        if (fenetre === null) {
          creerFenetre(handlersFenetre);
        } else {
          ramenerFenetre();
        }
      };
      if (lancement === 'fenetre') {
        ouvrirFenetrePrincipale();
      }
      // Après la fenêtre principale : elle reste la première fenêtre créée.
      fenetreDeRecherche.preparer();
      if (lancement === 'recherche') {
        fenetreDeRecherche.ouvrir();
      }
      // Pris par un autre programme (un raccourci de Cinnamon sur les mêmes touches), il ne marche pas : les réglages le disent.
      raccourciActif = globalShortcut.register(raccourciGlobal.touches, () => fenetreDeRecherche.ouvrir());
      app.on('will-quit', () => globalShortcut.unregisterAll());
      // La sync tourne tant que Notes tourne, fenêtre ouverte ou non (choix d'Eloi).
      sync.demarrer();

      // Mise à jour locale : l'AppImage remplacée par `npm run installer`. Fenêtre fermée, Notes se relance
      // aussitôt sur la nouvelle version ; ouverte, la barre de titre propose de relancer.
      const appImage = process.env['APPIMAGE'];
      if (appImage !== undefined && appImage !== '') {
        const surveillance = new UpdateWatcher(appImage, () => {
          miseAJourInstallee = true;
          if (fenetre === null) {
            quitterNotes(true);
          } else {
            fenetre.webContents.send(evenements.miseAJourInstallee);
          }
        });
        void surveillance.demarrer().catch(() => undefined);
        app.on('will-quit', () => surveillance.arreter());
      }
    });

    app.on('window-all-closed', () => app.quit());
  }
}
