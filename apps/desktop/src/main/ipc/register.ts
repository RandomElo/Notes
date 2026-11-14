import { app, ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { canaux } from '../../shared/ipc-contract';
import type { AiService } from '../ai/ai-service';
import type { creerHandlersExport } from './export';
import type { creerHandlersImages } from './images';
import type { creerHandlersBase } from './database';
import type { creerHandlersLiens } from './links';
import type { creerHandlersMemos } from './memos';
import type { creerHandlersNas } from './nas';
import type { creerHandlersCorrection } from './spellcheck';
import type { creerHandlersSync } from './sync';
import type { creerHandlersTheme } from './theme';
import type { creerHandlersCorbeille } from './trash';
import type { creerHandlersVault } from './vault';
import type { creerHandlersDepotMarkdown } from './markdown-drop';
import type { creerHandlersFenetre } from './window';
import type { creerHandlersNotion } from './notion';
import type { ErrorEntry, ErrorLog } from '../errors/error-log';

export interface IpcDependencies {
  nas: ReturnType<typeof creerHandlersNas>;
  vault: ReturnType<typeof creerHandlersVault>;
  depot: ReturnType<typeof creerHandlersDepotMarkdown>;
  fenetre: ReturnType<typeof creerHandlersFenetre>;
  theme: ReturnType<typeof creerHandlersTheme>;
  sync: ReturnType<typeof creerHandlersSync>;
  images: ReturnType<typeof creerHandlersImages>;
  liens: ReturnType<typeof creerHandlersLiens>;
  base: ReturnType<typeof creerHandlersBase>;
  exports: ReturnType<typeof creerHandlersExport>;
  corbeille: ReturnType<typeof creerHandlersCorbeille>;
  correction: ReturnType<typeof creerHandlersCorrection>;
  ia: AiService;
  memos: ReturnType<typeof creerHandlersMemos>;
  journal: ErrorLog;
  notion: ReturnType<typeof creerHandlersNotion>;
  /** Quitter, relancer sur une nouvelle version, page demandée par `--page=<id>`, barre de recherche du poste. */
  lancement: {
    quitter: () => void;
    relancer: () => void;
    miseAJourEnAttente: () => boolean;
    prendrePage: () => string | null;
    barreDeRecherche: () => Promise<boolean>;
  };
  /** Vrai si l'appel vient bien de la page de l'application. */
  expediteurAutorise: (evenement: IpcMainInvokeEvent) => boolean;
}

/** Branche chaque canal du contrat sur son handler, derrière le contrôle de l'expéditeur. */
export function enregistrerCanaux({ nas, vault, depot, fenetre, theme, sync, images, liens, base, exports, corbeille, correction, ia, memos, journal, notion, lancement, expediteurAutorise }: IpcDependencies): void {
  const brancher = (canal: string, handler: (...arguments_: unknown[]) => unknown): void => {
    ipcMain.handle(canal, (evenement, ...arguments_) => {
      if (!expediteurAutorise(evenement)) {
        throw new Error('Appel refusé.');
      }
      return handler(...arguments_);
    });
  };

  brancher(canaux.version, () => app.getVersion());

  brancher(canaux.reduireFenetre, () => fenetre.reduire());
  brancher(canaux.basculerAgrandissementFenetre, () => fenetre.basculerAgrandissement());
  brancher(canaux.fermerFenetre, () => fenetre.fermer());
  brancher(canaux.fenetreEstAgrandie, () => fenetre.estAgrandie());
  brancher(canaux.confirmerFermeture, () => fenetre.confirmerFermeture());

  brancher(canaux.lireEtatNas, () => nas.lireEtat());
  brancher(canaux.enregistrerNas, (saisie) => nas.enregistrer(saisie));
  brancher(canaux.oublierMotDePasse, () => nas.oublierMotDePasse());
  brancher(canaux.testerConnexion, () => nas.tester());

  brancher(canaux.etatVault, () => vault.etat());
  brancher(canaux.choisirDossierVault, () => vault.choisirDossier());
  brancher(canaux.utiliserDossierPropose, () => vault.utiliserDossierPropose());
  brancher(canaux.lireArbre, () => vault.lireArbre());
  brancher(canaux.creerPage, (demande) => vault.creerPage(demande));
  brancher(canaux.renommerPage, (demande) => vault.renommerPage(demande));
  brancher(canaux.listerMentionsCassees, () => vault.listerMentionsCassees());
  brancher(canaux.changerIcone, (demande) => vault.changerIcone(demande));
  brancher(canaux.changerMode, (demande) => vault.changerMode(demande));
  brancher(canaux.lireBase, (demande) => base.lire(demande));
  brancher(canaux.changerConfigDeBase, (demande) => base.changerConfig(demande));
  brancher(canaux.changerValeurDeBase, (demande) => base.changerValeur(demande));
  brancher(canaux.renommerChampDeBase, (demande) => base.renommerChamp(demande));
  brancher(canaux.renommerChoixDeBase, (demande) => base.renommerChoix(demande));
  brancher(canaux.retirerChoixDeBase, (demande) => base.retirerChoix(demande));
  brancher(canaux.ajouterIconeImage, (demande) => vault.ajouterIconeImage(demande));
  brancher(canaux.deplacerPage, (demande) => vault.deplacerPage(demande));
  brancher(canaux.deplacerPages, (demande) => vault.deplacerPages(demande));
  brancher(canaux.dupliquerPage, (demande) => vault.dupliquerPage(demande));
  brancher(canaux.supprimerPageVide, (demande) => vault.supprimerPageVide(demande));
  brancher(canaux.importer, (demande) => vault.importer(demande));
  brancher(canaux.lirePage, (demande) => vault.lirePage(demande));
  brancher(canaux.enregistrerPage, (demande) => vault.enregistrerPage(demande));
  brancher(canaux.enregistrerLargeursDesTableaux, (demande) => vault.enregistrerLargeursDesTableaux(demande));
  brancher(canaux.creerPagesDepuisMarkdown, (demande) => depot.creerPages(demande));
  brancher(canaux.markdownAAjouter, (demande) => depot.texteAAjouter(demande));
  brancher(canaux.listerConflits, (demande) => vault.listerConflits(demande));
  brancher(canaux.lireConflit, (demande) => vault.lireConflit(demande));
  brancher(canaux.resoudreConflit, (demande) => vault.resoudreConflit(demande));
  brancher(canaux.ecarterConflitDOrdre, (demande) => vault.ecarterConflitDOrdre(demande));
  brancher(canaux.lireConflitDOrdre, (demande) => vault.lireConflitDOrdre(demande));

  brancher(canaux.lireTheme, () => theme.lire());
  brancher(canaux.creerTheme, () => theme.creer());
  brancher(canaux.ouvrirTheme, () => theme.ouvrir());
  brancher(canaux.enregistrerTheme, (recu) => theme.enregistrer(recu));

  brancher(canaux.lireEtatSync, () => sync.lireEtat());
  brancher(canaux.synchroniserMaintenant, () => sync.synchroniser());
  brancher(canaux.etatVerrou, (demande) => sync.etatVerrou(demande));
  brancher(canaux.prendreVerrou, (demande) => sync.prendreVerrou(demande));
  brancher(canaux.quitterPage, (demande) => sync.quitterPage(demande));
  brancher(canaux.montrerFichier, (demande) => sync.montrerFichier(demande));
  brancher(canaux.pagesEnAttente, (demande) => sync.pagesEnAttente(demande));

  brancher(canaux.quitterNotes, () => lancement.quitter());
  brancher(canaux.relancerNotes, () => lancement.relancer());
  brancher(canaux.miseAJourEnAttente, () => lancement.miseAJourEnAttente());
  brancher(canaux.prendrePageDemandee, () => lancement.prendrePage());
  brancher(canaux.ouvrirBarreDeRecherche, () => lancement.barreDeRecherche());
  brancher(canaux.choisirArchivesNotion, () => notion.choisir());
  brancher(canaux.analyserNotion, (demande) => notion.analyser(demande));
  brancher(canaux.importerNotion, (demande) => notion.importer(demande));
  brancher(canaux.apercuNotion, (demande) => notion.apercu(demande));
  brancher(canaux.abandonnerNotion, () => notion.abandonner());
  brancher(canaux.signalerErreur, (erreur) => {
    const recue = erreurRecue(erreur);
    if (recue !== null) {
      journal.noter(recue);
    }
  });

  brancher(canaux.choisirImages, () => images.choisir());
  brancher(canaux.ajouterImage, (demande) => images.ajouter(demande));
  brancher(canaux.telechargerImage, (demande) => images.telecharger(demande));
  brancher(canaux.listerImagesAConvertir, () => images.aConvertir());
  brancher(canaux.lireImage, (demande) => images.lire(demande));
  brancher(canaux.convertirImage, (demande) => images.convertir(demande));
  brancher(canaux.listerFichiersInutilises, () => images.inutilises());
  brancher(canaux.retirerLeFond, (demande) => images.retirerLeFond(demande));
  brancher(canaux.copierImage, (demande) => images.copier(demande));
  brancher(canaux.ouvrirPdf, (demande) => images.ouvrirPdf(demande));
  brancher(canaux.apercuDuSite, (demande) => liens.apercuDuSite(demande));
  brancher(canaux.enregistrerFavicon, (demande) => liens.enregistrerFavicon(demande));

  brancher(canaux.exporter, (demande) => exports.exporter(demande));
  brancher(canaux.montrerExport, (demande) => exports.montrer(demande));
  brancher(canaux.lireImageDExport, (demande) => exports.lireImage(demande));

  brancher(canaux.mettreALaCorbeille, (demande) => corbeille.mettre(demande));
  brancher(canaux.mettreFichierJointALaCorbeille, (demande) => corbeille.mettreFichierJoint(demande));
  brancher(canaux.listerCorbeille, () => corbeille.lister());
  brancher(canaux.apercuCorbeille, (demande) => corbeille.apercu(demande));
  brancher(canaux.restaurerDeLaCorbeille, (demande) => corbeille.restaurer(demande));
  brancher(canaux.supprimerDeLaCorbeille, (demande) => corbeille.supprimer(demande));
  brancher(canaux.viderCorbeille, () => corbeille.vider());

  brancher(canaux.etatCorrection, () => correction.etat());
  brancher(canaux.installerCorrection, () => correction.installer());
  brancher(canaux.annulerInstallationCorrection, () => correction.annuler());
  brancher(canaux.desinstallerCorrection, () => correction.desinstaller());
  brancher(canaux.relancerCorrection, () => correction.relancer());
  brancher(canaux.chercherMiseAJourCorrection, () => correction.chercherMiseAJour());
  brancher(canaux.verifierOrthographe, (demande) => correction.verifier(demande));
  brancher(canaux.lireDictionnaire, () => correction.lireDictionnaire());
  brancher(canaux.ajouterAuDictionnaire, (demande) => correction.ajouterAuDictionnaire(demande));
  brancher(canaux.lireIgnores, () => correction.lireIgnores());
  brancher(canaux.ignorerRemarque, (demande) => correction.ignorer(demande));

  brancher(canaux.etatIa, () => ia.etat());
  brancher(canaux.enregistrerReglagesIa, (reglages) => ia.enregistrerReglages(reglages));
  brancher(canaux.consigneIa, (demande) => ia.consigne(demande));
  brancher(canaux.estimerIa, (demande) => ia.estimer(demande));
  brancher(canaux.lancerIa, (demande) => ia.lancer(demande));
  brancher(canaux.annulerIa, () => ia.annuler());
  brancher(canaux.historiqueIa, () => ia.lireHistorique());

  brancher(canaux.etatMemos, () => memos.etat());
  brancher(canaux.masquerMemos, (demande) => memos.masquer(demande));
  brancher(canaux.lireMemo, (demande) => memos.lire(demande));
  brancher(canaux.transcrireMemo, (demande) => memos.transcrire(demande));
  brancher(canaux.accepterMemo, (demande) => memos.accepter(demande));
  brancher(canaux.ecarterMemo, (demande) => memos.ecarter(demande));
  brancher(canaux.convertirMemo, (demande) => memos.convertir(demande));
  brancher(canaux.ouvrirDossierMemos, () => memos.ouvrirDossier());
  brancher(canaux.estimerMemos, (demande) => memos.estimer(demande));
  brancher(canaux.estimerMiseEnFormeMemo, (demande) => memos.estimerMiseEnForme(demande));
  brancher(canaux.installerModeleWhisper, () => memos.installerModele());
  brancher(canaux.annulerInstallationWhisper, () => memos.annulerInstallation());
}

const naturesDErreur: Record<string, string> = { erreur: 'affichage', promesse: 'affichage (promesse)', react: 'affichage (composant)' };

/** Erreur envoyée par le renderer, vérifiée : null si elle n'a pas la forme attendue. */
export function erreurRecue(erreur: unknown): ErrorEntry | null {
  if (typeof erreur !== 'object' || erreur === null) {
    return null;
  }
  const { nature, message, detail } = erreur as Record<string, unknown>;
  const origine = typeof nature === 'string' ? naturesDErreur[nature] : undefined;
  if (origine === undefined || typeof message !== 'string' || (detail !== undefined && typeof detail !== 'string')) {
    return null;
  }
  return detail === undefined ? { origine, message } : { origine, message, detail };
}
