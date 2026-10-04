import { BrowserWindow, screen } from 'electron';
import type { WebPreferences } from 'electron';
import { evenements } from '../../shared/ipc-contract';

const largeur = 640;
/** Hauteur au départ (champ seul) et au plus : la page demande la sienne. */
const hauteurDeDepart = 120;
const hauteurMax = 520;

export interface SearchWindowDependencies {
  /** Réglages de sécurité des fenêtres de l'application (preload, bac à sable). */
  webPreferences: WebPreferences;
  /** Charge la page de l'application sur sa vue « recherche » et la durcit comme la fenêtre principale. */
  charger: (fenetre: BrowserWindow) => void;
}

/**
 * Petite fenêtre qui ne contient que la recherche (README §7), ouverte par le
 * raccourci global au milieu de l'écran où se trouve la souris, devant les
 * autres fenêtres. Créée une fois et gardée cachée tant que l'application
 * tourne : l'afficher est instantané. Elle se cache dès qu'elle perd le
 * focus, comme une palette de commandes.
 */
export class SearchWindow {
  private fenetre: BrowserWindow | null = null;
  private prete = false;
  /** Demandée avant que sa page ne soit chargée : elle s'affiche dès qu'elle l'est. */
  private aMontrer = false;

  constructor(private readonly dependances: SearchWindowDependencies) {}

  /** Crée la fenêtre cachée et charge sa page, si ce n'est pas déjà fait. */
  preparer(): void {
    if (this.fenetre !== null) {
      return;
    }
    const fenetre = new BrowserWindow({
      width: largeur,
      height: hauteurDeDepart,
      show: false,
      frame: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      backgroundColor: '#1e2026',
      title: 'Notes, recherche',
      webPreferences: this.dependances.webPreferences,
    });
    this.fenetre = fenetre;
    this.prete = false;
    // Le titre reste celui-ci : la page porte celui de l'application.
    fenetre.on('page-title-updated', (evenement) => evenement.preventDefault());
    fenetre.once('ready-to-show', () => {
      this.prete = true;
      if (this.aMontrer) {
        this.montrer();
      }
    });
    fenetre.on('blur', () => this.cacher());
    fenetre.on('closed', () => {
      this.fenetre = null;
      this.prete = false;
    });
    this.dependances.charger(fenetre);
  }

  ouvrir(): void {
    this.preparer();
    this.aMontrer = true;
    if (this.prete) {
      this.montrer();
    }
  }

  cacher(): void {
    this.aMontrer = false;
    if (this.fenetre === null || this.fenetre.isDestroyed() || !this.fenetre.isVisible()) {
      return;
    }
    this.fenetre.hide();
    // La page repart de zéro pendant qu'elle est cachée : rien de la recherche précédente au prochain affichage.
    this.fenetre.webContents.send(evenements.rechercheCachee);
  }

  /** La page mesure son contenu et demande la hauteur qui lui va. */
  ajusterHauteur(hauteur: number): void {
    if (this.fenetre !== null && !this.fenetre.isDestroyed() && Number.isFinite(hauteur)) {
      this.fenetre.setContentSize(largeur, Math.round(Math.min(Math.max(hauteur, 48), hauteurMax)));
    }
  }

  /** Vrai si l'appel vient de la page de cette fenêtre. */
  estLaPage(cadre: Electron.WebFrameMain | null): boolean {
    return this.fenetre !== null && !this.fenetre.isDestroyed() && cadre === this.fenetre.webContents.mainFrame;
  }

  private montrer(): void {
    const fenetre = this.fenetre;
    if (fenetre === null || fenetre.isDestroyed()) {
      return;
    }
    const zone = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    const [, hauteur] = fenetre.getSize();
    fenetre.setBounds({ x: Math.round(zone.x + (zone.width - largeur) / 2), y: Math.round(zone.y + zone.height * 0.18), width: largeur, height: hauteur ?? hauteurDeDepart });
    fenetre.show();
    fenetre.focus();
    // Les pages ont pu changer pendant qu'elle était cachée.
    fenetre.webContents.send(evenements.rechercheMontree);
  }
}
