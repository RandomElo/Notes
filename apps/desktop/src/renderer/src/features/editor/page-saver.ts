import type { PageSaveResult } from '../../../../shared/ipc-contract';

/** Où en est l'enregistrement de la page ouverte. */
export type SaveState =
  | { genre: 'enregistre' }
  | { genre: 'modifie' }
  | { genre: 'enregistrement' }
  | { genre: 'erreur'; message: string };

export interface PageSaverOptions {
  /** Corps de la page tel qu'il a été lu sur le disque. */
  corpsDeBase: string;
  /** Temps sans frappe avant d'enregistrer. */
  delaiMs: number;
  /** Temps avant une nouvelle tentative après un échec. */
  delaiDeRepriseMs: number;
  /** Markdown de la page telle qu'elle est dans l'éditeur. */
  lireCorps: () => string;
  enregistrer: (corps: string, corpsDeBase: string) => Promise<PageSaveResult>;
  surEtat: (etat: SaveState) => void;
  /** Appelé après chaque écriture réussie, avec le corps écrit et le nom de la sauvegarde de conflit s'il y en a une. */
  surEnregistre: (corps: string, conflit: string | null) => void;
}

/**
 * Enregistrement automatique d'une page : attend une pause dans la frappe, ne
 * lance qu'une écriture à la fois, et reprend si la page a encore changé
 * pendant l'écriture. Aucune dépendance à React ni à l'éditeur, pour être testé seul.
 */
export class PageSaver {
  private corpsDeBase: string;
  private modifie = false;
  private enCours: Promise<void> | null = null;
  private minuterie: ReturnType<typeof setTimeout> | null = null;
  private arrete = false;

  constructor(private readonly options: PageSaverOptions) {
    this.corpsDeBase = options.corpsDeBase;
  }

  /** Corps que le disque est censé contenir : celui lu, ou le dernier enregistré. */
  get base(): string {
    return this.corpsDeBase;
  }

  /** Vrai tant que tout n'est pas sur le disque. */
  aDesModifications(): boolean {
    return this.modifie || this.enCours !== null;
  }

  /** À appeler à chaque modification du document. */
  signalerModification(): void {
    this.modifie = true;
    if (this.enCours === null) {
      this.options.surEtat({ genre: 'modifie' });
    }
    this.planifier(this.options.delaiMs);
  }

  /** La page a été rechargée depuis le disque : ce corps devient la nouvelle base. */
  remplacerBase(corps: string): void {
    this.corpsDeBase = corps;
  }

  /**
   * Enregistre tout de suite ce qui ne l'est pas. Le corps est lu avant toute
   * attente : l'éditeur peut être détruit juste après l'appel.
   */
  async vider(): Promise<void> {
    this.annulerMinuterie();
    const corps = this.modifie ? this.options.lireCorps() : null;
    if (this.enCours !== null) {
      await this.enCours;
    }
    if (corps !== null && this.modifie) {
      await this.lancer(corps);
    }
  }

  /** Autorise de nouveau les écritures planifiées, après un arrêt (React monte deux fois les composants en développement). */
  demarrer(): void {
    this.arrete = false;
  }

  /** Plus aucune écriture ne sera planifiée. Celle qui est en cours se termine. */
  arreter(): void {
    this.arrete = true;
    this.annulerMinuterie();
  }

  private planifier(delaiMs: number): void {
    this.annulerMinuterie();
    if (this.arrete) {
      return;
    }
    this.minuterie = setTimeout(() => {
      this.minuterie = null;
      if (this.enCours === null && this.modifie) {
        void this.lancer(this.options.lireCorps());
      }
    }, delaiMs);
  }

  private annulerMinuterie(): void {
    if (this.minuterie !== null) {
      clearTimeout(this.minuterie);
      this.minuterie = null;
    }
  }

  private lancer(corps: string): Promise<void> {
    this.modifie = false;
    if (corps === this.corpsDeBase) {
      this.options.surEtat({ genre: 'enregistre' });
      return Promise.resolve();
    }
    this.options.surEtat({ genre: 'enregistrement' });
    const base = this.corpsDeBase;
    const ecriture = this.options
      .enregistrer(corps, base)
      .catch((): PageSaveResult => ({ ok: false, erreur: { code: 'interne', message: 'Erreur inattendue.' } }))
      .then((resultat) => {
        this.enCours = null;
        if (!resultat.ok) {
          // Rien n'est perdu : la page reste à enregistrer, à la prochaine frappe ou après un délai.
          this.modifie = true;
          this.options.surEtat({ genre: 'erreur', message: resultat.erreur.message });
          this.planifier(this.options.delaiDeRepriseMs);
          return;
        }
        this.corpsDeBase = corps;
        this.options.surEnregistre(corps, resultat.conflit);
        if (this.modifie) {
          // La page a changé pendant l'écriture : la minuterie de la dernière frappe s'en charge.
          this.options.surEtat({ genre: 'modifie' });
          if (this.minuterie === null) {
            this.planifier(this.options.delaiMs);
          }
        } else {
          this.options.surEtat({ genre: 'enregistre' });
        }
      });
    this.enCours = ecriture;
    return ecriture;
  }
}
