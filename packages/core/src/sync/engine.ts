import { LocalFsError } from '../fs/local-fs';
import type { LocalFs } from '../fs/local-fs';
import { dossierParent, estDansDossier, joindreChemins, nomDeBase } from '../fs/paths';
import { RemoteFsError } from '../fs/remote-fs';
import type { RemoteFs } from '../fs/remote-fs';
import { fichierPage } from '../page/types';
import { alignerLaCasse, collisionsDeCasse } from './case';
import { estSauvegardeDeConflit, sauvegarderVersionDistante } from './conflict';
import { calculerDelta, memeTampon } from './delta';
import { sha256 } from './hash';
import { chargerIndex, enregistrerIndex } from './index-store';
import type { FileStamp, IndexStore, SyncIndex } from './index-store';
import { etatDuVerrou, lireVerrou } from './lock';
import type { LocalPageState } from './lock';
import { estIgnore, nomDuVerrou, releverDistant, releverLocal } from './scan';
import type { Releve, ScanEntry } from './scan';

export interface SyncContext {
  local: LocalFs;
  /** Le dossier du vault sur le NAS, vu comme une racine (voir fs/remote-subdir.ts). */
  distant: RemoteFs;
  index: IndexStore;
  /** Identifie le couple (dossier local, dossier du NAS) : un autre couple repart d'un index vide. */
  cle: string;
  maintenant(): number;
  /** Cet appareil : ses propres verrous restés dans un dossier à supprimer sont retirés. */
  appareil: string;
  /**
   * File d'attente partagée avec l'enregistrement des pages. Chaque écriture
   * de la sync dans le vault local s'y range avec la vérification qui la
   * précède : un enregistrement ne peut pas tomber entre les deux et être
   * écrasé sans sauvegarde. Par défaut, rien n'est mis en file.
   */
  exclusion?: <T>(tache: () => Promise<T>) => Promise<T>;
}

export interface CycleReport {
  pousses: string[];
  tires: string[];
  supprimesLocal: string[];
  supprimesDistant: string[];
  /** Sauvegardes de conflit créées pendant ce cycle. */
  conflits: string[];
  /** Toutes les sauvegardes de conflit présentes dans le vault local. */
  sauvegardes: string[];
  /** Chemins modifiés pendant le cycle : ils seront traités au suivant. */
  reportes: string[];
  erreurs: { chemin: string; message: string }[];
  /** Fichiers du poste que SMB refuserait (nom), jamais envoyés. */
  refuses: string[];
  /** L'index a été mis de côté parce qu'un côté était vide (voir delta.ts). */
  indexIgnore: boolean;
  /** Durées en millisecondes (horloge du contexte) : relevé du NAS et cycle entier, pour régler l'intervalle. */
  durees: { releveDistant: number; total: number };
}

/** Erreurs qui arrêtent le cycle entier : le NAS ne répond plus ou refuse la session. */
const codesFatals = new Set(['injoignable', 'identifiants_refuses', 'partage_introuvable', 'chiffrement_absent', 'non_connecte']);

/** Un fichier a bougé entre le relevé et le transfert : on n'y touche pas, le cycle suivant le reprendra. */
class Reporte extends Error {}

/**
 * Un cycle complet (docs/spec/sync.md) : relevé des deux côtés, comparaison à
 * l'index, transferts, mise à jour de l'index. Rien n'est jamais écrasé sans
 * que l'autre version soit gardée : quand les deux côtés divergent, la
 * version du NAS est sauvegardée à côté du fichier local, puis celle du poste
 * part sur le NAS. Une erreur réseau arrête le cycle ; l'index garde ce qui
 * a été fait jusque-là.
 */
export async function synchroniser(contexte: SyncContext): Promise<CycleReport> {
  const { local, distant } = contexte;
  const debut = contexte.maintenant();
  const index = await chargerIndex(contexte.index, contexte.cle);
  const indexAuDepart = JSON.stringify(index);
  const { releve: releveLocal, refuses } = await releverLocal(local);
  const debutReleveDistant = contexte.maintenant();
  const releveDistant = await releverDistant(distant);
  const dureeReleveDistant = contexte.maintenant() - debutReleveDistant;
  // Le NAS ne distingue pas les majuscules : deux noms qui ne diffèrent que par la casse sont laissés de côté,
  // et un changement de casse devient un renommage (voir case.ts).
  const exclus = [...new Set([...collisionsDeCasse(releveLocal), ...collisionsDeCasse(releveDistant)])];
  const renommages = await alignerLaCasse(local, distant, releveLocal, releveDistant, index, exclus);
  const delta = calculerDelta(releveLocal, releveDistant, index);
  const actions = delta.actions.filter((action) => !exclus.some((exclu) => estDansDossier(action.chemin, exclu)));

  const rapport: CycleReport = {
    pousses: [],
    tires: [],
    supprimesLocal: [],
    supprimesDistant: [],
    conflits: [],
    sauvegardes: [],
    reportes: [],
    erreurs: exclus.map((chemin) => ({ chemin, message: 'Un autre nom ne diffère de celui-ci que par les majuscules : le NAS ne sait pas les distinguer.' })),
    refuses,
    indexIgnore: delta.indexIgnore,
    durees: { releveDistant: dureeReleveDistant, total: 0 },
  };
  for (const { cote, vers } of renommages) {
    (cote === 'local' ? rapport.tires : rapport.pousses).push(vers);
  }
  if (delta.indexIgnore) {
    index.fichiers = {};
    index.dossiers = [];
  }
  const dossiers = new Set(index.dossiers);
  for (const [chemin, entree] of releveLocal) {
    if (entree.estDossier && releveDistant.get(chemin)?.estDossier === true) {
      dossiers.add(chemin);
    }
  }

  const transferts = new Transferts(contexte, index, releveLocal, releveDistant);
  try {
    for (const action of actions) {
      const { chemin } = action;
      try {
        switch (action.type) {
          case 'creerDossierDistant':
            await distant.creerDossier(chemin);
            dossiers.add(chemin);
            break;
          case 'creerDossierLocal':
            await local.creerDossier(chemin);
            dossiers.add(chemin);
            break;
          case 'pousser':
            await transferts.pousser(chemin);
            rapport.pousses.push(chemin);
            break;
          case 'tirer':
            await transferts.tirer(chemin);
            rapport.tires.push(chemin);
            break;
          case 'comparer': {
            const resultat = await transferts.comparer(chemin);
            if (resultat.sauvegarde !== null) {
              rapport.conflits.push(resultat.sauvegarde);
            }
            if (resultat.sens === 'pousse') {
              rapport.pousses.push(chemin);
            } else if (resultat.sens === 'tire') {
              rapport.tires.push(chemin);
            }
            break;
          }
          case 'supprimerDistant':
            await transferts.supprimerDistant(chemin);
            rapport.supprimesDistant.push(chemin);
            break;
          case 'supprimerLocal':
            await transferts.supprimerLocal(chemin);
            rapport.supprimesLocal.push(chemin);
            break;
          case 'oublier':
            delete index.fichiers[chemin];
            break;
          case 'supprimerDossierDistant':
            if (await supprimerDossierDistant(contexte, chemin)) {
              dossiers.delete(chemin);
              rapport.supprimesDistant.push(chemin);
            }
            break;
          case 'supprimerDossierLocal':
            if (await supprimerDossierLocal(local, chemin)) {
              dossiers.delete(chemin);
              rapport.supprimesLocal.push(chemin);
            }
            break;
          case 'incompatible':
            rapport.erreurs.push({ chemin, message: "Fichier d'un côté, dossier de l'autre : à régler à la main." });
            break;
        }
      } catch (erreur) {
        if (erreur instanceof Reporte) {
          rapport.reportes.push(chemin);
        } else if (erreur instanceof RemoteFsError && codesFatals.has(erreur.code)) {
          throw erreur;
        } else {
          rapport.erreurs.push({ chemin, message: messageDe(erreur) });
        }
      }
    }
  } finally {
    index.dossiers = [...dossiers].sort();
    if (JSON.stringify(index) !== indexAuDepart) {
      await enregistrerIndex(contexte.index, index);
    }
  }

  const supprimes = new Set(rapport.supprimesLocal);
  rapport.sauvegardes = [...releveLocal.keys(), ...rapport.tires, ...rapport.conflits]
    .filter((chemin, position, tous) => estSauvegardeDeConflit(chemin) && !supprimes.has(chemin) && tous.indexOf(chemin) === position)
    .sort();
  rapport.durees.total = contexte.maintenant() - debut;
  return rapport;
}

/**
 * Où en est une page du poste par rapport au NAS, pour le relâchement des
 * verrous : poussée si son `page.md` n'a pas changé depuis le dernier cycle.
 */
export async function etatLocalDePage(local: LocalFs, index: IndexStore, cle: string, page: string): Promise<LocalPageState> {
  const fichier = joindreChemins(page, fichierPage);
  const infos = await local.infos(fichier);
  if (infos === null) {
    return 'absente';
  }
  const connu = (await chargerIndex(index, cle)).fichiers[fichier];
  return connu !== undefined && memeTampon(infos, connu.local) ? 'poussee' : 'en_attente';
}

/** Les transferts d'un fichier, chacun précédé d'une vérification que rien n'a bougé depuis le relevé. */
class Transferts {
  constructor(
    private readonly contexte: SyncContext,
    private readonly index: SyncIndex,
    private readonly releveLocal: Releve,
    private readonly releveDistant: Releve,
  ) {}

  async pousser(chemin: string, octets?: Uint8Array): Promise<void> {
    const contenu = octets ?? (await this.contexte.local.lireOctets(chemin));
    const local = await this.verifierLocal(chemin);
    const distant = await this.verifierDistant(chemin);
    if (local === null || local === 'change' || distant === 'change') {
      throw new Reporte();
    }
    const hash = sha256(contenu);
    const connu = this.index.fichiers[chemin];
    // Seule la date a changé sur le poste : rien à envoyer.
    if (connu !== undefined && connu.hash === hash && distant !== null && memeTampon(distant, connu.distant)) {
      this.index.fichiers[chemin] = { ...connu, local };
      return;
    }
    const parent = dossierParent(chemin);
    if (parent !== '' && this.releveDistant.get(parent)?.estDossier !== true) {
      await this.contexte.distant.creerDossier(parent);
    }
    await this.contexte.distant.ecrire(chemin, contenu);
    const apres = await this.contexte.distant.infos(chemin);
    if (apres === null) {
      throw new RemoteFsError('interne', `Le fichier envoyé n'est pas sur le NAS : ${chemin}`);
    }
    this.index.fichiers[chemin] = { local, distant: tampon(apres), hash };
  }

  async tirer(chemin: string, octets?: Uint8Array): Promise<void> {
    const contenu = octets ?? (await this.contexte.distant.lire(chemin));
    const distant = await this.verifierDistant(chemin);
    if (distant === null || distant === 'change') {
      throw new Reporte();
    }
    const hash = sha256(contenu);
    await this.enExclusion(async () => {
      const local = await this.verifierLocal(chemin);
      if (local === 'change') {
        throw new Reporte();
      }
      const connu = this.index.fichiers[chemin];
      // Seule la date a changé sur le NAS : rien à recevoir.
      if (connu !== undefined && connu.hash === hash && local !== null && memeTampon(local, connu.local)) {
        this.index.fichiers[chemin] = { ...connu, distant };
        return;
      }
      const parent = dossierParent(chemin);
      if (parent !== '') {
        await this.contexte.local.creerDossier(parent);
      }
      await this.contexte.local.ecrireOctets(chemin, contenu);
      const apres = await this.contexte.local.infos(chemin);
      if (apres === null) {
        throw new LocalFsError('interne', `Le fichier reçu n'est pas sur le disque : ${chemin}`);
      }
      this.index.fichiers[chemin] = { local: tampon(apres), distant, hash };
    });
  }

  /**
   * Les deux côtés ont bougé. Contenus identiques : rien à faire. Un seul a
   * vraiment changé par rapport à l'index : il gagne. Sinon c'est un conflit :
   * la version du NAS est gardée à côté, celle du poste part sur le NAS.
   */
  async comparer(chemin: string): Promise<{ sens: 'pousse' | 'tire' | 'aucun'; sauvegarde: string | null }> {
    const contenuLocal = await this.contexte.local.lireOctets(chemin);
    const contenuDistant = await this.contexte.distant.lire(chemin);
    const local = await this.verifierLocal(chemin);
    const distant = await this.verifierDistant(chemin);
    if (local === null || local === 'change' || distant === null || distant === 'change') {
      throw new Reporte();
    }
    const hashLocal = sha256(contenuLocal);
    const hashDistant = sha256(contenuDistant);
    const connu = this.index.fichiers[chemin];

    if (hashLocal === hashDistant) {
      this.index.fichiers[chemin] = { local, distant, hash: hashLocal };
      return { sens: 'aucun', sauvegarde: null };
    }
    if (connu?.hash === hashLocal) {
      await this.tirer(chemin, contenuDistant);
      return { sens: 'tire', sauvegarde: null };
    }
    if (connu?.hash === hashDistant) {
      await this.pousser(chemin, contenuLocal);
      return { sens: 'pousse', sauvegarde: null };
    }
    const dossier = dossierParent(chemin);
    const prisSurLeNas = [...this.releveDistant.keys()].filter((autre) => dossierParent(autre) === dossier).map(nomDeBase);
    const sauvegarde = await this.enExclusion(() => sauvegarderVersionDistante(this.contexte.local, chemin, contenuDistant, new Date(this.contexte.maintenant()), prisSurLeNas));
    await this.pousser(chemin, contenuLocal);
    // La sauvegarde part aussitôt sur le NAS : l'autre appareil la reçoit à son prochain cycle.
    const infos = await this.contexte.local.infos(sauvegarde);
    if (infos !== null) {
      this.releveLocal.set(sauvegarde, { estDossier: false, modifieLe: infos.modifieLe, taille: infos.taille });
      await this.pousser(sauvegarde, contenuDistant).catch(() => undefined);
    }
    return { sens: 'pousse', sauvegarde };
  }

  async supprimerDistant(chemin: string): Promise<void> {
    const distant = await this.verifierDistant(chemin);
    if (distant === null || distant === 'change' || (await this.verifierLocal(chemin)) !== null) {
      throw new Reporte();
    }
    await this.contexte.distant.supprimer(chemin);
    delete this.index.fichiers[chemin];
  }

  async supprimerLocal(chemin: string): Promise<void> {
    if ((await this.verifierDistant(chemin)) !== null) {
      throw new Reporte();
    }
    await this.enExclusion(async () => {
      const local = await this.verifierLocal(chemin);
      if (local === null || local === 'change') {
        throw new Reporte();
      }
      await this.contexte.local.supprimer(chemin);
      delete this.index.fichiers[chemin];
    });
  }

  /** Une vérification du disque et l'écriture qui la suit, sans qu'un enregistrement de page se glisse entre les deux. */
  private enExclusion<T>(tache: () => Promise<T>): Promise<T> {
    return this.contexte.exclusion === undefined ? tache() : this.contexte.exclusion(tache);
  }

  /** État actuel du fichier local : celui du relevé (null s'il était et reste absent), ou « change » s'il a bougé depuis. */
  private async verifierLocal(chemin: string): Promise<FileStamp | null | 'change'> {
    return comparerAuReleve(await this.contexte.local.infos(chemin), this.releveLocal.get(chemin));
  }

  private async verifierDistant(chemin: string): Promise<FileStamp | null | 'change'> {
    return comparerAuReleve(await this.contexte.distant.infos(chemin), this.releveDistant.get(chemin));
  }
}

function comparerAuReleve(actuel: { modifieLe: number; taille: number; estDossier: boolean } | null, releve: ScanEntry | undefined): FileStamp | null | 'change' {
  if (actuel === null && releve === undefined) {
    return null;
  }
  if (actuel === null || releve === undefined || actuel.estDossier || releve.estDossier || !memeTampon(actuel, releve)) {
    return 'change';
  }
  return tampon(actuel);
}

function tampon(entree: { modifieLe: number; taille: number }): FileStamp {
  return { modifieLe: entree.modifieLe, taille: entree.taille };
}

/**
 * Supprime sur le NAS un dossier disparu du poste, s'il est vide. Un verrou
 * resté dedans est retiré s'il est à cet appareil ou périmé ; celui d'un
 * autre appareil vivant garde le dossier. Rend vrai si le dossier a disparu.
 */
async function supprimerDossierDistant(contexte: SyncContext, chemin: string): Promise<boolean> {
  const { distant } = contexte;
  const contenu = await distant.lister(chemin);
  if (contenu.some((entree) => !(entree.nom === nomDuVerrou && !entree.estDossier) && !estIgnore(joindreChemins(chemin, entree.nom)))) {
    return false;
  }
  if (contenu.some((entree) => entree.nom === nomDuVerrou)) {
    const verrou = etatDuVerrou(await lireVerrou(distant, chemin), contexte.appareil, contexte.maintenant());
    if (verrou.etat === 'autre') {
      return false;
    }
  }
  for (const entree of contenu) {
    await distant.supprimer(joindreChemins(chemin, entree.nom));
  }
  await distant.supprimer(chemin);
  return true;
}

async function supprimerDossierLocal(local: LocalFs, chemin: string): Promise<boolean> {
  if ((await local.lister(chemin)).length > 0) {
    return false;
  }
  await local.supprimer(chemin);
  return true;
}

function messageDe(erreur: unknown): string {
  return erreur instanceof RemoteFsError || erreur instanceof LocalFsError ? erreur.message : 'Erreur inattendue.';
}
