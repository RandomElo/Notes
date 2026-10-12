import { ajouterALHistoriqueIa, calibrer, fonctionsDePage, genererId, lireHistoriqueIa, lireReglagesIa, totauxParPeriode } from '@notes/core';
import type { AiPageFunction, AiRun, AiSettings, VaultContext } from '@notes/core';
import {
  aDuTexte,
  assemblerSections,
  consigneDesTitres,
  decouperEnSections,
  demandeDeSection,
  demandeDesTitres,
  mettreDeCote,
  mettreEnListes,
  nettoyerSortie,
  reponseDeSection,
  sortieMaxDeSection,
  sortieMaxDesTitres,
  titresCorriges,
} from '@notes/document';
import type { NoteSection } from '@notes/document';
import { consignesParDefaut, pageEntiereACopier, periodesMontrees } from '../../shared/ai-contract';
import type { AiEstimateResult, AiProgress, AiPromptResult, AiRequest, AiRunResult, AiState, AiUsageView } from '../../shared/ai-contract';
import type { SettingsStore } from '../settings/settings-store';
import { AiError } from './chat';
import type { ChatRequest, ChatResult } from './chat';
import { carteRetenue } from './hardware';
import type { GpuInfo } from './hardware';
import { contexteMinimal, evaluerModeles, kvParTokenDe, lireParametres, modeleConseille } from './local-models';
import type { LocalModel, LocalVerdict } from './local-models';
import { decrireModeleOllama, discuterAvecOllama, listerModelesOllama, occupationOllama } from './ollama-client';
import { caracteresParToken, compterEntree, compterSortie } from './token-count';

/** Clé de LiteLLM, que les versions 0.12.x gardaient dans le coffre à secrets : effacée au démarrage (LiteLLM abandonné le 2026-10-09). */
export const ancienneCleLitellm = 'litellm-api-key';

/** Contexte demandé quand la mémoire de la carte est inconnue (Ollama sur une autre machine, NVIDIA sans `nvidia-smi`). */
const contexteSansCarte = 16_384;
const longueurMaxDUnePage = 400_000;
/** Un modèle chargé à moins de 98 % en mémoire vidéo déborde sur le processeur. */
const partEnVramMinimale = 0.98;

export interface AiServiceDependencies {
  reglages: SettingsStore;
  /** Contexte du dossier des notes ouvert ; lève une erreur s'il n'y en a pas. */
  contexte: () => VaultContext;
  /** File des opérations du vault : l'historique est un fichier du dossier des notes. */
  enSerie: <T>(tache: () => Promise<T>) => Promise<T>;
  surAvancement: (avancement: AiProgress) => void;
  /** Après un appel : l'historique affiché est à relire. */
  surHistorique: () => void;
  /** Cartes graphiques du poste (`hardware.ts`). */
  cartes: () => Promise<GpuInfo[]>;
  maintenant?: () => number;
  octetsAleatoires: (taille: number) => Uint8Array;
  /** Remplaçables dans les tests. */
  ollama?: { lister: typeof listerModelesOllama; decrire: typeof decrireModeleOllama; occupation: typeof occupationOllama; discuter: typeof discuterAvecOllama };
}

interface Preparation {
  fonction: AiPageFunction;
  modele: string;
  automatique: boolean;
  systeme: string;
  envoye: string;
  reserves: string[];
  titre: string;
  entreeComptee: number;
  entree: number;
  sortie: number;
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

/** Un appel au modèle, consigne de la fonction par défaut ; `devant` : ce qui est déjà rendu, montré avec la réponse en cours. */
type Discussion = (texte: string, sortieMax: number | undefined, devant: string, systeme?: string) => Promise<ChatResult>;

/**
 * Ce qu'on colle dans un autre outil (un assistant en ligne, par exemple) :
 * la consigne de la fonction, puis le texte de la page tel quel. La phrase
 * sur les repères `[[BLOC-n]]` est retirée, puisque rien n'est mis de côté.
 */
export function consigneACopier(consigne: string, markdown: string): string {
  // Les lignes vides et les retraits de la consigne (sous-puces d'un exemple) restent.
  const sansReperes = consigne
    .split('\n')
    .flatMap((ligne) => {
      if (!/\[\[BLOC-\d+\]\]/.test(ligne)) {
        return [ligne];
      }
      const reste = ligne.replace(/\s*[^.]*\[\[BLOC-\d+\]\][^.]*\./g, '').trimEnd();
      return /\p{L}/u.test(reste) ? [reste] : [];
    })
    .join('\n')
    .trim();
  return `${sansReperes}\n\nVoici le texte :\n\n${markdown.trim()}\n`;
}

/** Ollama tourne-t-il sur ce poste ? Sinon la carte du poste ne dit rien de la sienne. */
export function ollamaSurLePoste(adresse: string): boolean {
  return /^https?:\/\/(localhost|127\.\d+\.\d+\.\d+|\[::1\])(:\d+)?(\/|$)/.test(adresse);
}

/**
 * Fonctions IA du poste (docs/spec/ia.md) : carte graphique et choix du modèle
 * local, estimation, appel annulable, arrêt si le modèle déborde de la
 * mémoire vidéo, nettoyage, historique. Un appel à la fois. Rien n'est jamais écrit dans la page ici : la proposition
 * repart au renderer, qui la montre avant que l'utilisateur ne l'accepte.
 */
export class AiService {
  private enCours: AbortController | null = null;
  private readonly maintenant: () => number;
  private readonly ollama;
  /** Contexte par token de chaque modèle local, lu une fois par `/api/show`. */
  private readonly kvParModele = new Map<string, number | null>();

  constructor(private readonly dependances: AiServiceDependencies) {
    this.maintenant = dependances.maintenant ?? Date.now;
    this.ollama = dependances.ollama ?? { lister: listerModelesOllama, decrire: decrireModeleOllama, occupation: occupationOllama, discuter: discuterAvecOllama };
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
    return { verdict: evaluerModeles(modeles, carte, ollamaSurLePoste(adresse)), carte };
  }

  async etat(): Promise<AiState> {
    const reglages = await this.reglagesIa();
    const local = await this.verdictLocal(reglages.adresseOllama);
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
    };
  }

  async enregistrerReglages(recu: unknown): Promise<AiState> {
    const actuels = await this.dependances.reglages.lire();
    await this.dependances.reglages.ecrire({ ...actuels, ia: lireReglagesIa(recu) });
    return this.etat();
  }

  /** La consigne de la fonction et le texte de la page, à copier dans un autre outil. Ne contacte aucun modèle. */
  async consigne(recu: unknown): Promise<AiPromptResult> {
    const demande = lireDemande(recu);
    if (demande === null) {
      return { ok: false, message: 'Demande illisible.' };
    }
    if (demande.markdown.trim() === '') {
      return { ok: false, message: 'La page n’a pas de texte.' };
    }
    const reglages = await this.reglagesIa();
    const consigne = reglages.consignes[demande.fonction] ?? consignesParDefaut[demande.fonction];
    return { ok: true, texte: consigneACopier(demande.fonction === 'mise-au-propre' ? `${consigne}\n\n${pageEntiereACopier}` : consigne, demande.markdown) };
  }

  private async preparer(demande: AiRequest): Promise<Preparation | string> {
    const reglages = await this.reglagesIa();
    const choix = reglages.modeles[demande.fonction];
    let modele = choix.modele;
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
    const contexteMax = evalue.contexteMax;

    const systeme = reglages.consignes[demande.fonction] ?? consignesParDefaut[demande.fonction];
    const { texte: envoye, reserves } = mettreDeCote(demande.markdown);
    if (envoye.replace(/\[\[BLOC-\d+\]\]/g, '').trim() === '') {
      return 'La page n’a pas de texte à retravailler.';
    }
    const appels = await this.historique();
    const calage = calibrer(appels, demande.fonction, modele);
    const entreeComptee = compterEntree(systeme, envoye);
    const entree = Math.round(entreeComptee * calage.facteurDEntree);
    const sortie = Math.round(entree * calage.ratioDeSortie);
    // Contexte par paliers de 4096 : Ollama recharge le modèle quand il change, autant que ce soit rare.
    const voulu = Math.max(contexteMinimal, Math.ceil((entree + sortie * 1.3 + 512) / 4096) * 4096);
    const plafond = contexteMax ?? contexteSansCarte;
    if (entree + sortie > plafond) {
      return `La page est trop longue pour ${modele} sur cette carte (${Math.round(plafond / 1000)} 000 tokens au plus avec la réponse).`;
    }
    return {
      fonction: demande.fonction,
      modele,
      automatique: choix.modele === '',
      systeme,
      envoye,
      reserves,
      titre: demande.titre,
      entreeComptee,
      entree,
      sortie,
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
    return {
      ok: true,
      modele: preparation.modele,
      automatique: preparation.automatique,
      entree: preparation.entree,
      sortie: preparation.sortie,
      dureeMs: preparation.dureeMs,
      appelsConnus: preparation.appelsConnus,
    };
  }

  /**
   * Durée probable d'une fonction sur un texte dont on ne connaît que la
   * longueur (un mémo pas encore transcrit, docs/spec/memos.md). null si l'IA locale
   * n'est pas disponible ou si ce modèle n'a encore jamais servi.
   */
  async dureeEstimee(fonction: AiPageFunction, caracteres: number): Promise<number | null> {
    const reglages = await this.reglagesIa();
    const local = await this.verdictLocal(reglages.adresseOllama).catch(() => null);
    if (local === null || !local.verdict.disponible) {
      return null;
    }
    const modele = reglages.modeles[fonction].modele === '' ? local.verdict.automatique : reglages.modeles[fonction].modele;
    if (modele === null || !local.verdict.modeles.some((candidat) => candidat.nom === modele && candidat.utilisable)) {
      return null;
    }
    const calage = calibrer(await this.historique(), fonction, modele);
    if (calage.msParTokenDeSortie === null) {
      return null;
    }
    const systeme = reglages.consignes[fonction] ?? consignesParDefaut[fonction];
    const entree = Math.round((Math.ceil((systeme.length + caracteres) / caracteresParToken) + compterEntree('', '')) * calage.facteurDEntree);
    return Math.round(calage.msParTokenDeSortie * entree * calage.ratioDeSortie);
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
    const reglages = await this.reglagesIa();
    // Dès le premier morceau, le modèle est chargé : s'il ne tient pas dans la mémoire vidéo, l'appel s'arrête
    // (choix d'Eloi, 2026-10-09 : abandonner avec un message plutôt que continuer très lentement).
    const arret = new AbortController();
    const transmettre = (): void => arret.abort();
    signal.addEventListener('abort', transmettre, { once: true });
    let controle: Promise<void> | null = null;
    let deborde = false;
    let recu = '';
    /** Un appel au modèle ; `devant` est ce qui a déjà été rendu, montré avec la réponse en cours. */
    const discuter: Discussion = (texte, sortieMax, devant, systeme = preparation.systeme) => {
      const requete: ChatRequest = {
        modele: preparation.modele,
        systeme,
        texte,
        signal: arret.signal,
        contexte: preparation.contexte,
        ...(sortieMax === undefined ? {} : { sortieMax }),
        surMorceau: (morceau) => {
          recu = devant + morceau;
          this.dependances.surAvancement({ texte: recu, sortie: Math.ceil(recu.length / caracteresParToken) });
          controle ??= this.aDeborde(reglages.adresseOllama, preparation.modele).then((oui) => {
            if (oui) {
              deborde = true;
              arret.abort();
            }
          });
        },
      };
      return this.ollama.discuter(reglages.adresseOllama, requete);
    };
    const debut = this.maintenant();
    let resultat: ChatResult;
    try {
      resultat = preparation.fonction === 'mise-au-propre' ? await this.parSections(preparation.envoye, discuter) : await discuter(preparation.envoye, undefined, '');
      await controle;
      if (deborde) {
        throw new AiError('annule', 'Le modèle a débordé de la mémoire vidéo.');
      }
    } catch (erreur) {
      await controle;
      const annule = erreur instanceof AiError && erreur.code === 'annule';
      if (annule) {
        await this.consigner(preparation, { texte: recu, entree: preparation.entree, sortie: compterSortie(recu) }, this.maintenant() - debut, true);
      }
      if (deborde) {
        return {
          ok: false,
          annule: false,
          message: `${preparation.modele} ne tient pas entièrement dans la mémoire de la carte graphique : une autre application l’occupe sans doute (un jeu, un logiciel de 3D ou de montage, un navigateur très chargé). L’appel est abandonné, il aurait été très lent. Ferme ce qui occupe la carte, puis relance.`,
        };
      }
      return { ok: false, annule, message: erreur instanceof AiError ? erreur.message : 'Le modèle a échoué.' };
    } finally {
      signal.removeEventListener('abort', transmettre);
    }
    const appel = await this.consigner(preparation, resultat, this.maintenant() - debut, false);
    const nettoye = nettoyerSortie({
      sortie: resultat.texte,
      entree: preparation.envoye,
      reserves: preparation.reserves,
      titre: preparation.titre,
      memeLongueur: preparation.fonction === 'relecture',
    });
    return { ok: true, markdown: nettoye.markdown, avertissements: nettoye.avertissements, appel };
  }

  /**
   * Mise au propre, une section après l'autre (`note-sections.ts`) : les
   * titres restent tels quels, les lignes qui se suivent sont mises en liste
   * avant l'appel, et une réponse peu sûre laisse les notes de la section.
   */
  private async parSections(envoye: string, discuter: Discussion): Promise<ChatResult> {
    const rendues: NoteSection[] = [];
    let entree = 0;
    let sortie = 0;
    for (const section of decouperEnSections(envoye)) {
      const corps = mettreEnListes(section.corps);
      if (!aDuTexte(corps)) {
        rendues.push({ titre: section.titre, corps });
        continue;
      }
      const devant = `${assemblerSections([...rendues, { titre: section.titre, corps: '' }])}\n\n`;
      const reponse = await discuter(demandeDeSection({ titre: section.titre, corps }), sortieMaxDeSection(corps), devant);
      entree += reponse.entree;
      sortie += reponse.sortie;
      rendues.push({ titre: section.titre, corps: reponseDeSection(corps, reponse.texte, reponse.coupee === true).texte });
    }
    // Les fautes des titres, corrigées à part en un appel : niveaux et place ne changent pas.
    const titres = rendues.flatMap((section) => (section.titre === null ? [] : [section.titre]));
    if (titres.length > 0) {
      const reponse = await discuter(demandeDesTitres(titres), sortieMaxDesTitres(titres), `${assemblerSections(rendues)}\n\n`, consigneDesTitres);
      entree += reponse.entree;
      sortie += reponse.sortie;
      const corriges = titresCorriges(titres, reponse.texte);
      let rang = 0;
      for (const section of rendues) {
        if (section.titre !== null) {
          section.titre = corriges[rang++]!;
        }
      }
    }
    return { texte: `${assemblerSections(rendues)}\n`, entree, sortie };
  }

  /** Ollama dit-il que le modèle, chargé, ne tient pas entièrement en mémoire vidéo ? */
  private async aDeborde(adresse: string, modele: string): Promise<boolean> {
    const charge = (await this.ollama.occupation(adresse).catch(() => null))?.find((candidat) => candidat.nom === modele);
    return charge !== undefined && charge.taille > 0 && charge.enVram < charge.taille * partEnVramMinimale;
  }

  /** Ajoute l'appel à l'historique, avec ce qu'en a compté le fournisseur, ou à défaut l'estimation. */
  private async consigner(preparation: Preparation, resultat: ChatResult, dureeMs: number, annule: boolean): Promise<AiRun> {
    const entree = resultat.entree > 0 ? resultat.entree : preparation.entree;
    const sortie = resultat.sortie > 0 ? resultat.sortie : compterSortie(resultat.texte);
    const maintenant = this.maintenant();
    const appel: AiRun = {
      id: genererId(maintenant, this.dependances.octetsAleatoires(10)),
      date: maintenant,
      fonction: preparation.fonction,
      fournisseur: 'ollama',
      modele: preparation.modele,
      entree,
      sortie,
      coutUsd: null,
      estimation: { entreeComptee: preparation.entreeComptee, entree: preparation.entree, sortie: preparation.sortie, coutUsd: null },
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
    const maintenant = this.maintenant();
    return {
      appels,
      totaux: {
        jour: totauxParPeriode(appels, 'jour', maintenant, periodesMontrees.jour),
        semaine: totauxParPeriode(appels, 'semaine', maintenant, periodesMontrees.semaine),
        mois: totauxParPeriode(appels, 'mois', maintenant, periodesMontrees.mois),
        annee: totauxParPeriode(appels, 'annee', maintenant, periodesMontrees.annee),
      },
    };
  }
}
