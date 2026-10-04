import { LockManager, RemoteFsError, etatApresCycle, etatApresEchec, etatDesactive, etatEnCours, etatLocalDePage, purgerCorbeille, sousDossierDistant, stockageDistant, synchroniser, transfererCorbeille } from '@notes/core';
import type { IndexStore, LocalFs, LockOwner, NasSettings, RemoteFs, SyncStatus, TakeResult } from '@notes/core';
import type { LockView } from '../../shared/ipc-contract';
import type { SettingsStore } from '../settings/settings-store';
import type { CompanionCredentials } from '../smb/protocol';

/** Intervalle entre deux cycles (README §5). */
const intervalleParDefautMs = 10_000;
/** Après une modification du dossier des notes, le cycle part ce délai plus tard : une rafale d'écritures n'en lance qu'un. */
const delaiApresModificationParDefautMs = 1_000;
/** À la fermeture, le dernier cycle a ce temps pour finir : au-delà, l'application se ferme quand même. */
const delaiMaxDeFermetureMs = 15_000;

/** Ce qui identifie un couple dossier des notes et NAS dans l'index de sync : changer l'un repart d'un index neuf. */
function cleDeLIndex(vaultLocal: string, nas: Pick<NasSettings, 'hote' | 'partage' | 'dossierVault'>): string {
  return JSON.stringify([vaultLocal, nas.hote, nas.partage, nas.dossierVault]);
}

/** Une connexion au NAS que la sync garde ouverte d'un cycle à l'autre. */
export interface SyncConnection extends RemoteFs {
  fermer(): void;
}

export interface SyncSchedulerDependencies {
  reglages: SettingsStore;
  lireMotDePasse: () => Promise<string | null>;
  /** Accès au vault local ouvert, null si aucun dossier n'est choisi. */
  localFs: () => LocalFs | null;
  creerConnexion: (identifiants: CompanionCredentials) => SyncConnection;
  index: IndexStore;
  /** Cet appareil, pour signer les verrous. */
  appareil: () => Promise<LockOwner>;
  surEtat: (etat: SyncStatus) => void;
  /** File d'attente des écritures du vault local, partagée avec l'enregistrement des pages. */
  enSerie?: <T>(tache: () => Promise<T>) => Promise<T>;
  /** Durée de chaque cycle, sans aucun chemin ni identifiant. Par défaut la console du main. */
  journal?: (ligne: string) => void;
  maintenant?: () => number;
  intervalleMs?: number;
  delaiApresModificationMs?: number;
}

interface Session {
  cle: string;
  connexion: SyncConnection;
  distant: RemoteFs;
  verrous: LockManager;
}

/**
 * Déclenche la sync du desktop : au démarrage, toutes les 10 s, une seconde
 * après chaque modification du dossier des notes, à la demande et à la
 * fermeture (README §5). Un seul cycle à la fois. Garde la connexion
 * au NAS ouverte entre deux cycles et tient les verrous de page.
 */
export class SyncScheduler {
  private etatCourant: SyncStatus = etatDesactive('Synchronisation pas encore lancée');
  private session: Session | null = null;
  /** Ouverture en cours : un cycle et une lecture de verrou simultanés partagent la même connexion. */
  private ouverture: Promise<Session | null> | null = null;
  private cycleEnCours: Promise<void> | null = null;
  /** Un cycle a été demandé pendant qu'un autre tournait : il repart dès la fin de celui-ci. */
  private cycleDemande = false;
  private minuteurDeModification: ReturnType<typeof setTimeout> | null = null;
  private minuteur: ReturnType<typeof setInterval> | null = null;
  /** Identifiants refusés : on ne réessaie pas tout seul, pour ne pas faire verrouiller le compte par le NAS. */
  private identifiantsRefuses = false;
  private arrete = false;
  /** Le poste n'a plus de réseau : aucun cycle avant son retour. */
  private horsLigne = false;
  /** La corbeille du NAS est purgée une fois par lancement, au premier cycle réussi (README §10). */
  private corbeillePurgee = false;
  private readonly maintenant: () => number;

  constructor(private readonly dependances: SyncSchedulerDependencies) {
    this.maintenant = dependances.maintenant ?? Date.now;
  }

  etat(): SyncStatus {
    return this.etatCourant;
  }

  demarrer(): void {
    void this.synchroniser();
    this.minuteur ??= setInterval(() => void this.synchroniser(), this.dependances.intervalleMs ?? intervalleParDefautMs);
  }

  /** Lance un cycle, ou rend celui qui tourne déjà. */
  synchroniser(): Promise<void> {
    if (this.arrete) {
      return Promise.resolve();
    }
    this.cycleEnCours ??= this.cycle().finally(() => {
      this.cycleEnCours = null;
      if (this.cycleDemande) {
        this.cycleDemande = false;
        void this.synchroniser();
      }
    });
    return this.cycleEnCours;
  }

  /**
   * Le dossier des notes a changé sur le poste (page enregistrée, image
   * ajoutée, autre outil) : un cycle part peu après, pour que l'autre appareil
   * le voie sans attendre l'intervalle. Les écritures de la sync elle-même
   * en lancent aussi un, qui ne trouve plus rien à faire.
   */
  signalerModificationLocale(): void {
    if (this.arrete) {
      return;
    }
    if (this.minuteurDeModification !== null) {
      clearTimeout(this.minuteurDeModification);
    }
    this.minuteurDeModification = setTimeout(() => {
      this.minuteurDeModification = null;
      this.demanderCycle();
    }, this.dependances.delaiApresModificationMs ?? delaiApresModificationParDefautMs);
  }

  /**
   * La page n'est plus ouverte : son verrou est rendu dès qu'elle est sur le
   * NAS, à la fin d'un cycle lancé tout de suite.
   */
  async quitterPage(page: string): Promise<void> {
    if (this.session?.verrous.quitter(page) === true) {
      await this.demanderCycle();
    }
  }

  /**
   * Le poste a perdu ou retrouvé le réseau (câble, wifi). Perdu : le cycle en
   * cours est abandonné (connexion fermée) et le NAS montré injoignable tout
   * de suite, sans attendre la fin du délai du client SMB. Retrouvé : un cycle part.
   */
  signalerReseau(enLigne: boolean): void {
    if (this.arrete || enLigne !== this.horsLigne) {
      return;
    }
    this.horsLigne = !enLigne;
    if (enLigne) {
      void this.demanderCycle();
      return;
    }
    this.emettre(etatApresEchec('injoignable', this.etatCourant, this.maintenant()));
    void this.fermerSession();
  }

  /** Un cycle, maintenant ou juste après celui qui tourne (qui a pu relever le dossier avant le changement). */
  private demanderCycle(): Promise<void> {
    if (this.cycleEnCours !== null) {
      this.cycleDemande = true;
      return this.cycleEnCours;
    }
    return this.synchroniser();
  }

  /** Réglages du NAS, mot de passe ou dossier des notes changés : on repart d'une connexion neuve. */
  async reconfigurer(): Promise<void> {
    await this.cycleEnCours?.catch(() => undefined);
    this.identifiantsRefuses = false;
    await this.fermerSession();
    await this.synchroniser();
  }

  async etatVerrou(page: string): Promise<LockView> {
    if (this.horsLigne) {
      return { etat: 'inconnu' };
    }
    try {
      const session = await this.ouvrirSession();
      return session === null ? { etat: 'inconnu' } : await session.verrous.consulter(page);
    } catch {
      return { etat: 'inconnu' };
    }
  }

  /**
   * Appelé à la frappe. Sans NAS (pas réglé, injoignable), l'édition reste
   * permise : le desktop travaille hors ligne et la sync gardera les deux
   * versions s'il le faut.
   */
  async prendreVerrou(page: string, forcer: boolean): Promise<TakeResult> {
    if (this.horsLigne) {
      return { ok: true };
    }
    try {
      const session = await this.ouvrirSession();
      return session === null ? { ok: true } : await session.verrous.prendre(page, forcer);
    } catch {
      return { ok: true };
    }
  }

  /**
   * Parmi ces pages, celles que le NAS n'a pas encore dans leur dernière
   * version (point sur leur onglet). Aucune quand la sync n'est pas réglée.
   * Ne contacte pas le NAS : l'état se lit dans l'index du dernier cycle.
   */
  async pagesEnAttente(pages: readonly string[]): Promise<string[]> {
    const reglages = await this.dependances.reglages.lire();
    const local = this.dependances.localFs();
    if (reglages.nas === null || reglages.vaultLocal === null || local === null) {
      return [];
    }
    const cle = cleDeLIndex(reglages.vaultLocal, reglages.nas);
    const enAttente: string[] = [];
    for (const page of pages) {
      if ((await etatLocalDePage(local, this.dependances.index, cle, page).catch(() => 'absente')) === 'en_attente') {
        enAttente.push(page);
      }
    }
    return enAttente;
  }

  /**
   * Exécute une action sur le dossier des notes du NAS, par la connexion de
   * la sync (corbeille). null si le NAS n'est pas réglé ou si le poste est
   * hors ligne ; une erreur du NAS remonte telle quelle.
   */
  async avecNas<T>(action: (distant: RemoteFs) => Promise<T>): Promise<T | null> {
    if (this.horsLigne || this.identifiantsRefuses) {
      return null;
    }
    const session = await this.ouvrirSession();
    return session === null ? null : action(session.distant);
  }

  /** À la fermeture : dernier cycle (borné dans le temps), verrous rendus, connexion fermée. */
  async arreter(): Promise<void> {
    this.arreterMinuteurs();
    await this.dernierCycle();
    this.arrete = true;
    await this.fermerSession();
  }

  private arreterMinuteurs(): void {
    if (this.minuteur !== null) {
      clearInterval(this.minuteur);
      this.minuteur = null;
    }
    if (this.minuteurDeModification !== null) {
      clearTimeout(this.minuteurDeModification);
      this.minuteurDeModification = null;
    }
  }

  /** Un dernier cycle après celui qui tourne, puis les verrous rendus. Borné dans le temps : au-delà, on ferme quand même. */
  private async dernierCycle(): Promise<void> {
    const fin = (async () => {
      await this.cycleEnCours?.catch(() => undefined);
      await this.synchroniser();
      await this.session?.verrous.toutRelacher();
    })();
    await Promise.race([fin, new Promise((resoudre) => setTimeout(resoudre, delaiMaxDeFermetureMs))]);
  }

  private async cycle(): Promise<void> {
    if (this.identifiantsRefuses || this.horsLigne) {
      return;
    }
    try {
      const session = await this.ouvrirSession();
      const local = this.dependances.localFs();
      if (session === null || local === null) {
        return;
      }
      this.emettre(etatEnCours(this.etatCourant));
      const rapport = await synchroniser({
        local,
        distant: session.distant,
        index: this.dependances.index,
        cle: session.cle,
        maintenant: this.maintenant,
        appareil: (await this.dependances.appareil()).appareil,
        ...(this.dependances.enSerie === undefined ? {} : { exclusion: this.dependances.enSerie }),
      });
      // Les pages mises à la corbeille depuis le dernier cycle partent dans celle du NAS. Sous la file
      // d'attente du vault : une restauration ou une suppression ne tombe pas au milieu.
      const exclusion = this.dependances.enSerie ?? (<T>(tache: () => Promise<T>) => tache());
      await exclusion(() => transfererCorbeille(local, session.distant));
      if (!this.corbeillePurgee) {
        await purgerCorbeille(stockageDistant(session.distant), this.maintenant());
        this.corbeillePurgee = true;
      }
      // L'entretien des verrous ne doit pas changer l'état affiché : un verrou non rafraîchi périme tout seul.
      await session.verrous.entretenir((page) => etatLocalDePage(local, this.dependances.index, session.cle, page)).catch(() => undefined);
      (this.dependances.journal ?? console.info)(`Sync : relevé du NAS ${rapport.durees.releveDistant} ms, cycle ${rapport.durees.total} ms`);
      if (!this.horsLigne) {
        this.emettre(etatApresCycle(rapport, this.maintenant()));
      }
    } catch (erreur) {
      if (this.horsLigne) {
        // Cycle coupé par la perte du réseau : l'état injoignable est déjà affiché.
        return;
      }
      if (!(erreur instanceof RemoteFsError)) {
        this.emettre({ ...this.etatCourant, etat: 'en_attente', message: 'Synchronisation interrompue, nouvel essai dans un instant' });
        return;
      }
      if (erreur.code === 'identifiants_refuses') {
        this.identifiantsRefuses = true;
        this.emettre({ ...etatApresEchec(erreur.code, this.etatCourant, this.maintenant()), message: 'Identifiants refusés par le NAS : saisis à nouveau le mot de passe' });
      } else {
        this.emettre(etatApresEchec(erreur.code, this.etatCourant, this.maintenant()));
      }
      // La session sera rouverte au prochain cycle.
      await this.fermerSession();
    }
  }

  /** Ouvre la connexion au NAS si les réglages le permettent. null (et état « désactivée ») sinon. */
  private ouvrirSession(): Promise<Session | null> {
    this.ouverture ??= this.preparerSession().finally(() => {
      this.ouverture = null;
    });
    return this.ouverture;
  }

  private async preparerSession(): Promise<Session | null> {
    if (this.identifiantsRefuses) {
      return null;
    }
    const reglages = await this.dependances.reglages.lire();
    if (reglages.nas === null) {
      this.desactiver('Connexion au NAS pas réglée');
      return null;
    }
    if (reglages.vaultLocal === null || this.dependances.localFs() === null) {
      this.desactiver('Aucun dossier des notes choisi');
      return null;
    }
    const motDePasse = await this.dependances.lireMotDePasse();
    if (motDePasse === null) {
      this.desactiver('Mot de passe du NAS à saisir dans les réglages');
      return null;
    }
    const { hote, partage, utilisateur, dossierVault } = reglages.nas;
    const cle = cleDeLIndex(reglages.vaultLocal, reglages.nas);
    if (this.session?.cle === cle) {
      return this.session;
    }
    await this.fermerSession();
    const connexion = this.dependances.creerConnexion({ hote, partage, utilisateur, motDePasse });
    const distant = sousDossierDistant(connexion, dossierVault);
    // Le dossier du vault est créé sur le NAS s'il n'existe pas (réglage `dossierVault`).
    if (dossierVault !== '') {
      try {
        await connexion.creerDossier(dossierVault);
      } catch (erreur) {
        connexion.fermer();
        throw erreur;
      }
    }
    this.session = { cle, connexion, distant, verrous: new LockManager(distant, await this.dependances.appareil(), this.maintenant) };
    return this.session;
  }

  private async fermerSession(): Promise<void> {
    const session = this.session;
    this.session = null;
    session?.connexion.fermer();
  }

  private desactiver(message: string): void {
    if (this.etatCourant.etat !== 'desactivee' || this.etatCourant.message !== message) {
      this.emettre(etatDesactive(message));
    }
  }

  private emettre(etat: SyncStatus): void {
    this.etatCourant = etat;
    this.dependances.surEtat(etat);
  }
}
