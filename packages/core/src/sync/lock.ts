import { joindreChemins } from '../fs/paths';
import { RemoteFsError } from '../fs/remote-fs';
import type { RemoteFs } from '../fs/remote-fs';
import { versOctets, versTexte } from '../fs/utf8';
import { nomDuVerrou } from './scan';

/**
 * Verrou d'une page sur le NAS (README §5) : un fichier `.lock` dans le
 * dossier de la page, qui dit quel appareil l'édite et depuis quand il a
 * donné signe de vie. Il n'est jamais copié dans le vault local.
 */

/** Au-delà, un verrou sans nouvelles est périmé et se reprend sans demander. */
export const dureeDeVieDuVerrouMs = 90_000;
/** Sans frappe depuis ce délai, le desktop relâche le verrou, une fois la page poussée sur le NAS. */
export const inactiviteAvantRelacheMs = 60_000;

export interface LockOwner {
  /** Identifiant propre à l'installation, tiré au hasard une fois pour toutes. */
  appareil: string;
  /** Nom lisible de l'appareil, affiché à l'autre (« pc-fixe »). */
  nom: string;
  pid: number;
}

export interface LockFile extends LockOwner {
  /** Dernier signe de vie, en millisecondes depuis l'époque Unix. */
  heartbeat: number;
}

export type LockState =
  | { etat: 'libre' }
  | { etat: 'a_moi' }
  /** Tenu par un autre appareil qui a donné signe de vie il y a moins de 90 s. */
  | { etat: 'autre'; nom: string; heartbeat: number }
  /** Tenu par un autre appareil silencieux, ou illisible : il se reprend. */
  | { etat: 'perime'; nom: string };

export function cheminDuVerrou(page: string): string {
  return joindreChemins(page, nomDuVerrou);
}

export function ecrireVerrou(verrou: LockFile): Uint8Array {
  return versOctets(`${JSON.stringify({ holder: verrou.appareil, nom: verrou.nom, pid: verrou.pid, heartbeat: new Date(verrou.heartbeat).toISOString() })}\n`);
}

/** Lit le contenu d'un `.lock`. null s'il est illisible : il compte alors comme périmé. */
export function analyserVerrou(octets: Uint8Array): LockFile | null {
  try {
    const brut: unknown = JSON.parse(versTexte(octets));
    if (typeof brut !== 'object' || brut === null) {
      return null;
    }
    const { holder, nom, pid, heartbeat } = brut as Record<string, unknown>;
    const instant = typeof heartbeat === 'string' ? Date.parse(heartbeat) : Number.NaN;
    if (typeof holder !== 'string' || holder === '' || Number.isNaN(instant)) {
      return null;
    }
    return { appareil: holder, nom: typeof nom === 'string' ? nom.slice(0, 100) : '', pid: typeof pid === 'number' ? pid : 0, heartbeat: instant };
  } catch {
    return null;
  }
}

/** Lit le verrou d'une page. null s'il n'y en a pas, « illisible » s'il existe mais ne se lit pas. */
export async function lireVerrou(distant: RemoteFs, page: string): Promise<LockFile | null | 'illisible'> {
  try {
    return analyserVerrou(await distant.lire(cheminDuVerrou(page))) ?? 'illisible';
  } catch (erreur) {
    if (erreur instanceof RemoteFsError && erreur.code === 'introuvable') {
      return null;
    }
    throw erreur;
  }
}

export function etatDuVerrou(verrou: LockFile | null | 'illisible', appareil: string, maintenant: number): LockState {
  if (verrou === null) {
    return { etat: 'libre' };
  }
  if (verrou === 'illisible') {
    return { etat: 'perime', nom: '' };
  }
  if (verrou.appareil === appareil) {
    return { etat: 'a_moi' };
  }
  if (maintenant - verrou.heartbeat > dureeDeVieDuVerrouMs) {
    return { etat: 'perime', nom: verrou.nom };
  }
  return { etat: 'autre', nom: verrou.nom, heartbeat: verrou.heartbeat };
}

/** Où en est la page sur le poste, vue par la sync : poussée sur le NAS, modifiée depuis, ou disparue. */
export type LocalPageState = 'poussee' | 'en_attente' | 'absente';

export type TakeResult = { ok: true } | { ok: false; nom: string };

/**
 * Verrous tenus par cet appareil. Le desktop pose le verrou à la première
 * frappe, l'entretient tant qu'on écrit, et le relâche après 60 s sans
 * frappe une fois la page poussée (README §5). `distant` est la vue du
 * dossier du vault sur le NAS : les chemins sont ceux des pages.
 */
export class LockManager {
  private readonly tenus = new Map<string, { derniereFrappe: number }>();

  constructor(
    private readonly distant: RemoteFs,
    private readonly moi: LockOwner,
    private readonly maintenant: () => number,
  ) {}

  /** Pages dont cet appareil tient le verrou. */
  pagesTenues(): string[] {
    return [...this.tenus.keys()];
  }

  async consulter(page: string): Promise<LockState> {
    return etatDuVerrou(await lireVerrou(this.distant, page), this.moi.appareil, this.maintenant());
  }

  /**
   * À chaque frappe (le renderer espace les appels). Si le verrou est déjà
   * tenu, seule la date de frappe change. Sinon il est posé, sauf s'il est
   * tenu par un autre appareil vivant et que l'on ne force pas.
   */
  async prendre(page: string, forcer = false): Promise<TakeResult> {
    const tenu = this.tenus.get(page);
    if (tenu !== undefined && !forcer) {
      tenu.derniereFrappe = this.maintenant();
      return { ok: true };
    }
    const avant = await this.consulter(page);
    if (avant.etat === 'autre' && !forcer) {
      return { ok: false, nom: avant.nom };
    }
    await this.poser(page, true);
    // Deux appareils qui posent en même temps : le dernier écrit gagne, l'autre le voit en relisant.
    const apres = await lireVerrou(this.distant, page);
    if (apres !== null && apres !== 'illisible' && apres.appareil !== this.moi.appareil) {
      this.tenus.delete(page);
      return { ok: false, nom: apres.nom };
    }
    this.tenus.set(page, { derniereFrappe: this.maintenant() });
    return { ok: true };
  }

  /**
   * Appelé après chaque cycle de sync. Relâche les verrous inactifs dont la
   * page est poussée, et tout de suite celui d'une page qui n'existe plus sur
   * le poste (renommée, déplacée). Entretient les autres. Rend les pages dont
   * un autre appareil a pris le verrou entre-temps (« Forcer l'édition »).
   */
  async entretenir(etatLocal: (page: string) => Promise<LocalPageState>): Promise<{ relachees: string[]; perdues: { page: string; nom: string }[] }> {
    const relachees: string[] = [];
    const perdues: { page: string; nom: string }[] = [];
    for (const [page, { derniereFrappe }] of [...this.tenus]) {
      const etat = await etatLocal(page);
      if (etat === 'absente' || (etat === 'poussee' && this.maintenant() - derniereFrappe >= inactiviteAvantRelacheMs)) {
        await this.relacher(page);
        relachees.push(page);
        continue;
      }
      const actuel = etatDuVerrou(await lireVerrou(this.distant, page), this.moi.appareil, this.maintenant());
      if (actuel.etat === 'autre') {
        this.tenus.delete(page);
        perdues.push({ page, nom: actuel.nom });
        continue;
      }
      try {
        await this.poser(page, false);
      } catch (erreur) {
        // Dossier disparu du NAS : la prochaine frappe reposera le verrou.
        if (!(erreur instanceof RemoteFsError && erreur.code === 'introuvable')) {
          throw erreur;
        }
        this.tenus.delete(page);
      }
    }
    return { relachees, perdues };
  }

  /** Retire le verrou de la page s'il est encore à cet appareil. */
  async relacher(page: string): Promise<void> {
    this.tenus.delete(page);
    const actuel = await lireVerrou(this.distant, page);
    if (actuel !== null && actuel !== 'illisible' && actuel.appareil === this.moi.appareil) {
      await supprimerSiPresent(this.distant, cheminDuVerrou(page));
    }
  }

  /** À la fermeture de l'application. Les erreurs sont ignorées : un verrou oublié périme en 90 s. */
  async toutRelacher(): Promise<void> {
    for (const page of this.pagesTenues()) {
      await this.relacher(page).catch(() => undefined);
    }
  }

  /**
   * Écrit le verrou. Le dossier de la page n'est créé sur le NAS que pour une
   * première prise (page pas encore poussée) : l'entretien ne doit pas faire
   * renaître le dossier d'une page renommée entre-temps.
   */
  private async poser(page: string, creerDossier: boolean): Promise<void> {
    if (creerDossier) {
      await this.distant.creerDossier(page);
    }
    await this.distant.ecrire(cheminDuVerrou(page), ecrireVerrou({ ...this.moi, heartbeat: this.maintenant() }));
  }
}

async function supprimerSiPresent(distant: RemoteFs, chemin: string): Promise<void> {
  try {
    await distant.supprimer(chemin);
  } catch (erreur) {
    if (!(erreur instanceof RemoteFsError && erreur.code === 'introuvable')) {
      throw erreur;
    }
  }
}
