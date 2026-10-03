import { LockManager, RemoteFsError, etatApresCycle, etatApresEchec, etatDesactive, etatEnCours, etatLocalDePage, sousDossierDistant, synchroniser } from '@notes/core';
import type { IndexStore, LocalFs, LockOwner, RemoteFs, SyncStatus, TakeResult } from '@notes/core';
import type { LockView } from '../../shared/ipc-contract';
import type { SettingsStore } from '../settings/settings-store';
import type { CompanionCredentials } from '../smb/protocol';

/** Intervalle entre deux cycles (README §5). */
const intervalleParDefautMs = 30_000;
/** À la fermeture, le dernier cycle a ce temps pour finir : au-delà, l'application se ferme quand même. */
const delaiMaxDeFermetureMs = 15_000;

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
  maintenant?: () => number;
  intervalleMs?: number;
}

interface Session {
  cle: string;
  connexion: SyncConnection;
  distant: RemoteFs;
  verrous: LockManager;
}

/**
 * Déclenche la sync du desktop : au démarrage, toutes les 30 s, à la demande
 * et à la fermeture (README §5). Un seul cycle à la fois. Garde la connexion
 * au NAS ouverte entre deux cycles et tient les verrous de page.
 */
export class SyncScheduler {
  private etatCourant: SyncStatus = etatDesactive('Synchronisation pas encore lancée');
  private session: Session | null = null;
  /** Ouverture en cours : un cycle et une lecture de verrou simultanés partagent la même connexion. */
  private ouverture: Promise<Session | null> | null = null;
  private cycleEnCours: Promise<void> | null = null;
  private minuteur: ReturnType<typeof setInterval> | null = null;
  /** Identifiants refusés : on ne réessaie pas tout seul, pour ne pas faire verrouiller le compte par le NAS. */
  private identifiantsRefuses = false;
  private arrete = false;
  private readonly maintenant: () => number;

  constructor(private readonly dependances: SyncSchedulerDependencies) {
    this.maintenant = dependances.maintenant ?? Date.now;
  }

  etat(): SyncStatus {
    return this.etatCourant;
  }

  demarrer(): void {
    void this.synchroniser();
    this.minuteur = setInterval(() => void this.synchroniser(), this.dependances.intervalleMs ?? intervalleParDefautMs);
  }

  /** Lance un cycle, ou rend celui qui tourne déjà. */
  synchroniser(): Promise<void> {
    if (this.arrete) {
      return Promise.resolve();
    }
    this.cycleEnCours ??= this.cycle().finally(() => {
      this.cycleEnCours = null;
    });
    return this.cycleEnCours;
  }

  /** Réglages du NAS, mot de passe ou dossier des notes changés : on repart d'une connexion neuve. */
  async reconfigurer(): Promise<void> {
    await this.cycleEnCours?.catch(() => undefined);
    this.identifiantsRefuses = false;
    await this.fermerSession();
    await this.synchroniser();
  }

  async etatVerrou(page: string): Promise<LockView> {
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
    try {
      const session = await this.ouvrirSession();
      return session === null ? { ok: true } : await session.verrous.prendre(page, forcer);
    } catch {
      return { ok: true };
    }
  }

  /** À la fermeture : dernier cycle (borné dans le temps), verrous rendus, connexion fermée. */
  async arreter(): Promise<void> {
    if (this.minuteur !== null) {
      clearInterval(this.minuteur);
      this.minuteur = null;
    }
    const fin = (async () => {
      await this.cycleEnCours?.catch(() => undefined);
      await this.synchroniser();
      this.arrete = true;
      await this.session?.verrous.toutRelacher();
    })();
    await Promise.race([fin, new Promise((resoudre) => setTimeout(resoudre, delaiMaxDeFermetureMs))]);
    this.arrete = true;
    await this.fermerSession();
  }

  private async cycle(): Promise<void> {
    if (this.identifiantsRefuses) {
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
      });
      // L'entretien des verrous ne doit pas changer l'état affiché : un verrou non rafraîchi périme tout seul.
      await session.verrous.entretenir((page) => etatLocalDePage(local, this.dependances.index, session.cle, page)).catch(() => undefined);
      this.emettre(etatApresCycle(rapport, this.maintenant()));
    } catch (erreur) {
      if (!(erreur instanceof RemoteFsError)) {
        this.emettre({ ...this.etatCourant, etat: 'en_attente', message: 'Synchronisation interrompue, nouvel essai dans un instant' });
        return;
      }
      if (erreur.code === 'identifiants_refuses') {
        this.identifiantsRefuses = true;
        this.emettre({ ...etatApresEchec(erreur.code, this.etatCourant), message: 'Identifiants refusés par le NAS : saisis à nouveau le mot de passe' });
      } else {
        this.emettre(etatApresEchec(erreur.code, this.etatCourant));
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
    const cle = JSON.stringify([reglages.vaultLocal, hote, partage, dossierVault]);
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
