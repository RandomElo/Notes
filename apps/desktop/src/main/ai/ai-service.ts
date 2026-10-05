import { ajouterALHistoriqueIa, calibrer, depenseDeLaPeriode, fonctionsDePage, genererId, lireHistoriqueIa, lireReglagesIa, totauxParPeriode } from '@notes/core';
import type { AiPageFunction, AiRun, AiSettings, VaultContext } from '@notes/core';
import { mettreDeCote, nettoyerSortie } from '@notes/document';
import { consignesParDefaut, periodesMontrees } from '../../shared/ai-contract';
import type { AiApiModelView, AiEstimateResult, AiProgress, AiRequest, AiRunResult, AiState, AiUsageView } from '../../shared/ai-contract';
import type { SecretStore } from '../secrets/secret-store';
import type { SettingsStore } from '../settings/settings-store';
import { AiError } from './chat';
import type { ChatRequest, ChatResult } from './chat';
import { carteRetenue } from './hardware';
import type { GpuInfo } from './hardware';
import { discuterAvecLitellm, listerModelesLitellm } from './litellm-client';
import type { ApiModel } from './litellm-client';
import { contexteMinimal, evaluerModeles, kvParTokenDe, lireParametres, modeleConseille } from './local-models';
import type { LocalModel, LocalVerdict } from './local-models';
import { decrireModeleOllama, discuterAvecOllama, listerModelesOllama, occupationOllama } from './ollama-client';
import { coutEnDollars, dateDesTarifs, tarifDuModele } from './openai-prices';
import { compterEntree, compterSortie } from './token-count';

/** Clé de LiteLLM dans le coffre à secrets. */
export const cleLitellm = 'litellm-api-key';

/** Contexte demandé quand la mémoire de la carte est inconnue (Ollama sur une autre machine, NVIDIA sans `nvidia-smi`). */
const contexteSansCarte = 16_384;
const longueurMaxDUnePage = 400_000;
/** Liste des modèles de LiteLLM gardée quelques minutes : l'estimation la lit à chaque ouverture de la fenêtre. */
const dureeDuCacheLitellmMs = 5 * 60_000;
/** Un modèle chargé à moins de 98 % en mémoire vidéo déborde sur le processeur. */
const partEnVramMinimale = 0.98;

export interface AiServiceDependencies {
  reglages: SettingsStore;
  secrets: SecretStore;
  /** Contexte du dossier des notes ouvert ; lève une erreur s'il n'y en a pas. */
  contexte: () => VaultContext;
  /** File des opérations du vault : l'historique est un fichier du dossier des notes. */
  enSerie: <T>(tache: () => Promise<T>) => Promise<T>;
  surAvancement: (avancement: AiProgress) => void;
  /** Après un appel ou un changement de réglages : la dépense affichée est à relire. */
  surHistorique: () => void;
  /** Cartes graphiques du poste (`hardware.ts`). */
  cartes: () => Promise<GpuInfo[]>;
  maintenant?: () => number;
  octetsAleatoires: (taille: number) => Uint8Array;
  /** Remplaçables dans les tests. */
  ollama?: { lister: typeof listerModelesOllama; decrire: typeof decrireModeleOllama; occupation: typeof occupationOllama; discuter: typeof discuterAvecOllama };
  litellm?: { lister: typeof listerModelesLitellm; discuter: typeof discuterAvecLitellm };
}

interface Preparation {
  fonction: AiPageFunction;
  fournisseur: 'ollama' | 'litellm';
  modele: string;
  automatique: boolean;
  systeme: string;
  envoye: string;
  reserves: string[];
  titre: string;
  entreeComptee: number;
  entree: number;
  sortie: number;
  coutUsd: number | null;
  tarifInconnu: boolean;
  dureeMs: number | null;
  appelsConnus: number;
  contexte: number;
}

const champs = (valeur: unknown): Record<string, unknown> => (typeof valeur === 'object' && valeur !== null ? (valeur as Record<string, unknown>) : {});

/** Une demande venue du renderer, vérifiée. */
export function lireDemande(recu: unknown): AiRequest | null {
  const { fonction, markdown, titre } = champs(recu);
  if (!fonctionsDePage.includes(fonction as AiPageFunction) || typeof markdown !== 'string' || markdown.length > longueurMaxDUnePage || typeof titre !== 'string' || titre.length > 500) {
    return null;
  }
  return { fonction: fonction as AiPageFunction, markdown, titre };
}

/** Une clé d'API plausible : des caractères imprimables, sans espace. LiteLLM accepte ses propres formats de clé. */
export function cleValide(valeur: unknown): valeur is string {
  return typeof valeur === 'string' && /^[\x21-\x7e]{8,500}$/.test(valeur.trim());
}

/** Ollama tourne-t-il sur ce poste ? Sinon la carte du poste ne dit rien de la sienne. */
export function ollamaSurLePoste(adresse: string): boolean {
  return /^https?:\/\/(localhost|127\.\d+\.\d+\.\d+|\[::1\])(:\d+)?(\/|$)/.test(adresse);
}

/**
 * Fonctions IA du poste (README §12) : carte graphique et choix du modèle
 * local, LiteLLM, clé, estimation, appel annulable, nettoyage, historique. Un
 * appel à la fois. Rien n'est jamais écrit dans la page ici : la proposition
 * repart au renderer, qui la montre avant que l'utilisateur ne l'accepte.
 */
export class AiService {
  private enCours: AbortController | null = null;
  private readonly maintenant: () => number;
  private readonly ollama;
  private readonly litellm;
  /** Contexte par token de chaque modèle local, lu une fois par `/api/show`. */
  private readonly kvParModele = new Map<string, number | null>();
  /** Modèles qu'Ollama a vus déborder de la mémoire vidéo pendant cette session. */
  private readonly debordants = new Set<string>();
  private cacheLitellm: { cle: string; au: number; modeles: ApiModel[] | null } | null = null;

  constructor(private readonly dependances: AiServiceDependencies) {
    this.maintenant = dependances.maintenant ?? Date.now;
    this.ollama = dependances.ollama ?? { lister: listerModelesOllama, decrire: decrireModeleOllama, occupation: occupationOllama, discuter: discuterAvecOllama };
    this.litellm = dependances.litellm ?? { lister: listerModelesLitellm, discuter: discuterAvecLitellm };
  }

  private async reglagesIa(): Promise<AiSettings> {
    return (await this.dependances.reglages.lire()).ia;
  }

  private async historique(): Promise<AiRun[]> {
    try {
      const contexte = this.dependances.contexte();
      return await this.dependances.enSerie(() => lireHistoriqueIa(contexte));
    } catch {
      return [];
    }
  }

  /** La carte qui ferait tourner Ollama : celle du poste, si Ollama y tourne. */
  private async carte(adresse: string): Promise<GpuInfo | null> {
    if (!ollamaSurLePoste(adresse)) {
      return null;
    }
    return carteRetenue(await this.dependances.cartes().catch(() => []));
  }

  /** Ce que la carte permet avec les modèles installés ; null si Ollama ne répond pas. */
  private async verdictLocal(adresse: string): Promise<{ verdict: LocalVerdict; carte: GpuInfo | null } | null> {
    const installes = await this.ollama.lister(adresse);
    if (installes === null) {
      return null;
    }
    const modeles: LocalModel[] = [];
    for (const modele of installes) {
      if (!this.kvParModele.has(modele.nom)) {
        const infos = await this.ollama.decrire(adresse, modele.nom);
        this.kvParModele.set(modele.nom, infos === null ? null : kvParTokenDe(infos));
      }
      modeles.push({ nom: modele.nom, taille: modele.taille, parametres: lireParametres(modele.parametres), famille: modele.famille, kvParToken: this.kvParModele.get(modele.nom) ?? null });
    }
    const carte = await this.carte(adresse);
    return { verdict: evaluerModeles(modeles, carte, ollamaSurLePoste(adresse), this.debordants), carte };
  }

  /** Modèles de LiteLLM, gardés quelques minutes ; null sans adresse ni clé, ou si LiteLLM ne répond pas. */
  private async modelesLitellm(reglages: AiSettings, forcer = false): Promise<ApiModel[] | null> {
    const cle = await this.dependances.secrets.lire(cleLitellm);
    if (reglages.adresseLitellm === '' || cle === null) {
      return null;
    }
    const empreinte = `${reglages.adresseLitellm} ${cle.length}`;
    if (!forcer && this.cacheLitellm !== null && this.cacheLitellm.cle === empreinte && this.maintenant() - this.cacheLitellm.au < dureeDuCacheLitellmMs && this.cacheLitellm.modeles !== null) {
      return this.cacheLitellm.modeles;
    }
    const modeles = await this.litellm.lister(reglages.adresseLitellm, cle);
    this.cacheLitellm = { cle: empreinte, au: this.maintenant(), modeles };
    return modeles;
  }

  async etat(): Promise<AiState> {
    const reglages = await this.reglagesIa();
    const [local, modelesLitellm, appels, etatDeLaCle] = await Promise.all([
      this.verdictLocal(reglages.adresseOllama),
      this.modelesLitellm(reglages, true),
      this.historique(),
      this.dependances.secrets.etat(cleLitellm),
    ]);
    const carte = local?.carte ?? (await this.carte(reglages.adresseOllama));
    return {
      reglages,
      carte: carte === null ? null : { nom: carte.nom, vram: carte.vram, dediee: carte.dediee },
      ollama: local === null ? 'injoignable' : 'joignable',
      local: {
        disponible: local?.verdict.disponible ?? false,
        raison: local === null ? 'Ollama ne répond pas à cette adresse.' : local.verdict.raison,
        automatique: local?.verdict.automatique ?? null,
        modeles: (local?.verdict.modeles ?? []).map(({ nom, parametres, utilisable, raison }) => ({ nom, parametres, utilisable, raison })),
        conseil: local !== null && !local.verdict.disponible && carte?.dediee === true ? modeleConseille(carte.vram) : null,
      },
      cleLitellm: etatDeLaCle,
      modelesLitellm:
        modelesLitellm?.map((modele): AiApiModelView => {
          const tarif = tarifDuModele(modele.nom, reglages.tarifs, modele.tarif);
          return { nom: modele.nom, tarif: tarif?.tarif ?? null, source: tarif?.source ?? null };
        }) ?? null,
      dateDesTarifs,
      depenseDuJourUsd: depenseDeLaPeriode(appels, 'jour', this.maintenant()),
      depenseDuMoisUsd: depenseDeLaPeriode(appels, 'mois', this.maintenant()),
    };
  }

  async enregistrerReglages(recu: unknown): Promise<AiState> {
    const actuels = await this.dependances.reglages.lire();
    await this.dependances.reglages.ecrire({ ...actuels, ia: lireReglagesIa(recu) });
    // Une fonction passée à LiteLLM ou revenue au poste : la barre de statut montre ou cache la dépense.
    this.dependances.surHistorique();
    return this.etat();
  }

  async enregistrerCle(recu: unknown): Promise<AiState> {
    if (cleValide(recu)) {
      await this.dependances.secrets.enregistrer(cleLitellm, recu.trim());
      this.cacheLitellm = null;
    }
    return this.etat();
  }

  async oublierCle(): Promise<AiState> {
    await this.dependances.secrets.oublier(cleLitellm);
    this.cacheLitellm = null;
    return this.etat();
  }

  private async preparer(demande: AiRequest): Promise<Preparation | string> {
    const reglages = await this.reglagesIa();
    const choix = reglages.modeles[demande.fonction];
    const { fournisseur } = choix;
    let modele = choix.modele;
    let contexteMax: number | null = null;
    let tarifLitellm = null;

    if (fournisseur === 'ollama') {
      const local = await this.verdictLocal(reglages.adresseOllama);
      if (local === null) {
        return 'Ollama ne répond pas. Vérifie qu’il tourne (réglages, Fonctions IA).';
      }
      if (!local.verdict.disponible) {
        return local.verdict.raison ?? 'Pas d’IA locale sur ce poste.';
      }
      if (modele === '') {
        modele = local.verdict.automatique!;
      }
      const evalue = local.verdict.modeles.find((candidat) => candidat.nom === modele);
      if (evalue === undefined) {
        return `Le modèle « ${modele} » n’est pas installé dans Ollama.`;
      }
      if (!evalue.utilisable) {
        return `${modele} : ${evalue.raison ?? 'ne convient pas à cette carte.'}`;
      }
      contexteMax = evalue.contexteMax;
    } else {
      if (modele === '') {
        return 'Choisis d’abord un modèle de LiteLLM pour cette fonction dans les réglages.';
      }
      if (reglages.adresseLitellm === '') {
        return 'L’adresse de LiteLLM n’est pas réglée.';
      }
      tarifLitellm = (await this.modelesLitellm(reglages))?.find((candidat) => candidat.nom === modele)?.tarif ?? null;
    }

    const systeme = reglages.consignes[demande.fonction] ?? consignesParDefaut[demande.fonction];
    const { texte: envoye, reserves } = mettreDeCote(demande.markdown);
    if (envoye.replace(/\[\[BLOC-\d+\]\]/g, '').trim() === '') {
      return 'La page n’a pas de texte à retravailler.';
    }
    const appels = await this.historique();
    const calage = calibrer(appels, demande.fonction, modele);
    const entreeComptee = await compterEntree(fournisseur, systeme, envoye);
    const entree = Math.round(entreeComptee * calage.facteurDEntree);
    const sortie = Math.round(entree * calage.ratioDeSortie);
    // Contexte par paliers de 4096 : Ollama recharge le modèle quand il change, autant que ce soit rare.
    const voulu = Math.max(contexteMinimal, Math.ceil((entree + sortie * 1.3 + 512) / 4096) * 4096);
    const plafond = contexteMax ?? contexteSansCarte;
    if (fournisseur === 'ollama' && entree + sortie > plafond) {
      return `La page est trop longue pour ${modele} sur cette carte (${Math.round(plafond / 1000)} 000 tokens au plus avec la réponse).`;
    }
    const tarif = fournisseur === 'litellm' ? tarifDuModele(modele, reglages.tarifs, tarifLitellm) : null;
    return {
      fonction: demande.fonction,
      fournisseur,
      modele,
      automatique: fournisseur === 'ollama' && choix.modele === '',
      systeme,
      envoye,
      reserves,
      titre: demande.titre,
      entreeComptee,
      entree,
      sortie,
      coutUsd: tarif === null ? null : coutEnDollars(tarif.tarif, entree, sortie),
      tarifInconnu: fournisseur === 'litellm' && tarif === null,
      dureeMs: calage.msParTokenDeSortie === null ? null : Math.round(calage.msParTokenDeSortie * sortie),
      appelsConnus: calage.appelsConnus,
      contexte: Math.min(voulu, Math.max(contexteMinimal, Math.floor(plafond / 4096) * 4096)),
    };
  }

  async estimer(recu: unknown): Promise<AiEstimateResult> {
    const demande = lireDemande(recu);
    if (demande === null) {
      return { ok: false, message: 'Demande illisible.' };
    }
    const preparation = await this.preparer(demande);
    if (typeof preparation === 'string') {
      return { ok: false, message: preparation };
    }
    const reglages = await this.reglagesIa();
    const appels = await this.historique();
    const depenseDuMoisUsd = depenseDeLaPeriode(appels, 'mois', this.maintenant());
    const seuil = reglages.seuilMensuelUsd;
    return {
      ok: true,
      fournisseur: preparation.fournisseur,
      modele: preparation.modele,
      automatique: preparation.automatique,
      entree: preparation.entree,
      sortie: preparation.sortie,
      coutUsd: preparation.coutUsd,
      tarifInconnu: preparation.tarifInconnu,
      dureeMs: preparation.dureeMs,
      appelsConnus: preparation.appelsConnus,
      depenseDuJourUsd: depenseDeLaPeriode(appels, 'jour', this.maintenant()),
      depenseDuMoisUsd,
      seuilMensuelUsd: seuil,
      seuilDepasse: seuil !== null && depenseDuMoisUsd + (preparation.coutUsd ?? 0) > seuil,
    };
  }

  annuler(): void {
    this.enCours?.abort();
  }

  async lancer(recu: unknown): Promise<AiRunResult> {
    const demande = lireDemande(recu);
    if (demande === null) {
      return { ok: false, annule: false, message: 'Demande illisible.' };
    }
    if (this.enCours !== null) {
      return { ok: false, annule: false, message: 'Une demande est déjà en cours.' };
    }
    const controleur = new AbortController();
    this.enCours = controleur;
    try {
      const preparation = await this.preparer(demande);
      if (typeof preparation === 'string') {
        return { ok: false, annule: false, message: preparation };
      }
      return await this.executer(preparation, controleur.signal);
    } finally {
      this.enCours = null;
    }
  }

  private async executer(preparation: Preparation, signal: AbortSignal): Promise<AiRunResult> {
    let recu = '';
    const requete: ChatRequest = {
      modele: preparation.modele,
      systeme: preparation.systeme,
      texte: preparation.envoye,
      signal,
      surMorceau: (texte) => {
        recu = texte;
        this.dependances.surAvancement({ texte, sortie: Math.ceil(texte.length / 3.6) });
      },
      ...(preparation.fournisseur === 'ollama' ? { contexte: preparation.contexte } : {}),
    };
    const reglages = await this.reglagesIa();
    const debut = this.maintenant();
    let resultat: ChatResult;
    try {
      if (preparation.fournisseur === 'litellm') {
        const cle = await this.dependances.secrets.lire(cleLitellm);
        if (cle === null) {
          return { ok: false, annule: false, message: 'Aucune clé LiteLLM n’est enregistrée sur ce poste.' };
        }
        resultat = await this.litellm.discuter(reglages.adresseLitellm, cle, requete);
      } else {
        resultat = await this.ollama.discuter(reglages.adresseOllama, requete);
      }
    } catch (erreur) {
      const annule = erreur instanceof AiError && erreur.code === 'annule';
      if (annule) {
        // Une demande arrêtée en route a pu être facturée : elle va dans l'historique, sortie comptée par Notes.
        await this.consigner(preparation, { texte: recu, entree: preparation.entree, sortie: await compterSortie(preparation.fournisseur, recu) }, this.maintenant() - debut, true);
      }
      return { ok: false, annule, message: erreur instanceof AiError ? erreur.message : 'Le modèle a échoué.' };
    }
    const appel = await this.consigner(preparation, resultat, this.maintenant() - debut, false);
    const nettoye = nettoyerSortie({
      sortie: resultat.texte,
      entree: preparation.envoye,
      reserves: preparation.reserves,
      titre: preparation.titre,
      memeLongueur: preparation.fonction === 'relecture',
    });
    const avertissements = [...nettoye.avertissements];
    if (preparation.fournisseur === 'ollama' && (await this.aDeborde(reglages.adresseOllama, preparation.modele))) {
      avertissements.push(`${preparation.modele} a débordé de la mémoire vidéo pendant cet appel (une autre application l’occupe peut-être) : il ne sera plus proposé avant le prochain lancement de Notes.`);
    }
    return { ok: true, markdown: nettoye.markdown, avertissements, appel };
  }

  /** Ollama dit-il que le modèle, encore chargé, ne tient pas entièrement en mémoire vidéo ? Le modèle est alors écarté pour la session. */
  private async aDeborde(adresse: string, modele: string): Promise<boolean> {
    const charge = (await this.ollama.occupation(adresse))?.find((candidat) => candidat.nom === modele);
    if (charge === undefined || charge.taille === 0 || charge.enVram >= charge.taille * partEnVramMinimale) {
      return false;
    }
    this.debordants.add(modele);
    return true;
  }

  /** Ajoute l'appel à l'historique, avec ce qu'en a compté le fournisseur, ou à défaut l'estimation. */
  private async consigner(preparation: Preparation, resultat: ChatResult, dureeMs: number, annule: boolean): Promise<AiRun> {
    const entree = resultat.entree > 0 ? resultat.entree : preparation.entree;
    const sortie = resultat.sortie > 0 ? resultat.sortie : await compterSortie(preparation.fournisseur, resultat.texte);
    let coutUsd: number | null = null;
    if (preparation.fournisseur === 'litellm') {
      const reglages = await this.reglagesIa();
      const tarifLitellm = this.cacheLitellm?.modeles?.find((candidat) => candidat.nom === preparation.modele)?.tarif ?? null;
      const tarif = tarifDuModele(preparation.modele, reglages.tarifs, tarifLitellm);
      coutUsd = tarif === null ? null : coutEnDollars(tarif.tarif, entree, sortie);
    }
    const maintenant = this.maintenant();
    const appel: AiRun = {
      id: genererId(maintenant, this.dependances.octetsAleatoires(10)),
      date: maintenant,
      fonction: preparation.fonction,
      fournisseur: preparation.fournisseur,
      modele: preparation.modele,
      entree,
      sortie,
      coutUsd,
      estimation: { entreeComptee: preparation.entreeComptee, entree: preparation.entree, sortie: preparation.sortie, coutUsd: preparation.coutUsd },
      dureeMs,
      annule,
    };
    try {
      const contexte = this.dependances.contexte();
      await this.dependances.enSerie(() => ajouterALHistoriqueIa(contexte, appel));
      this.dependances.surHistorique();
    } catch {
      // Pas de dossier des notes ou disque en erreur : la proposition reste utilisable, seul l'historique manque.
    }
    return appel;
  }

  async lireHistorique(): Promise<AiUsageView> {
    const appels = await this.historique();
    const reglages = await this.reglagesIa();
    const maintenant = this.maintenant();
    return {
      appels,
      litellmChoisi: fonctionsDePage.some((fonction) => reglages.modeles[fonction].fournisseur === 'litellm'),
      totaux: {
        jour: totauxParPeriode(appels, 'jour', maintenant, periodesMontrees.jour),
        semaine: totauxParPeriode(appels, 'semaine', maintenant, periodesMontrees.semaine),
        mois: totauxParPeriode(appels, 'mois', maintenant, periodesMontrees.mois),
        annee: totauxParPeriode(appels, 'annee', maintenant, periodesMontrees.annee),
      },
      depenseDuJourUsd: depenseDeLaPeriode(appels, 'jour', maintenant),
      depenseDuMoisUsd: depenseDeLaPeriode(appels, 'mois', maintenant),
      seuilMensuelUsd: reglages.seuilMensuelUsd,
    };
  }
}
