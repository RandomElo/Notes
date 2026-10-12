import { app, ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { canaux } from '../../shared/ipc-contract';
import type { AiService } from '../ai/ai-service';
import type { creerHandlersExport } from './export';
import type { creerHandlersImages } from './images';
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

export interface IpcDependencies {
  nas: ReturnType<typeof creerHandlersNas>;
  vault: ReturnType<typeof creerHandlersVault>;
  depot: ReturnType<typeof creerHandlersDepotMarkdown>;
  fenetre: ReturnType<typeof creerHandlersFenetre>;
  theme: ReturnType<typeof creerHandlersTheme>;
  sync: ReturnType<typeof creerHandlersSync>;
  images: ReturnType<typeof creerHandlersImages>;
  liens: ReturnType<typeof creerHandlersLiens>;
  exports: ReturnType<typeof creerHandlersExport>;
  corbeille: ReturnType<typeof creerHandlersCorbeille>;
  correction: ReturnType<typeof creerHandlersCorrection>;
  ia: AiService;
  memos: ReturnType<typeof creerHandlersMemos>;
  /** Quitter, relancer sur une nouvelle version, page demandée par `--page=<id>`. */
  lancement: {
    quitter: () => void;
    relancer: () => void;
    miseAJourEnAttente: () => boolean;
    prendrePage: () => string | null;
  };
  /** Vrai si l'appel vient bien de la page de l'application. */
  expediteurAutorise: (evenement: IpcMainInvokeEvent) => boolean;
}

/** Branche chaque canal du contrat sur son handler, derrière le contrôle de l'expéditeur. */
export function enregistrerCanaux({ nas, vault, depot, fenetre, theme, sync, images, liens, exports, corbeille, correction, ia, memos, lancement, expediteurAutorise }: IpcDependencies): void {
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

  brancher(canaux.choisirImages, () => images.choisir());
  brancher(canaux.ajouterImage, (demande) => images.ajouter(demande));
  brancher(canaux.telechargerImage, (demande) => images.telecharger(demande));
  brancher(canaux.listerImagesAConvertir, () => images.aConvertir());
  brancher(canaux.lireImage, (demande) => images.lire(demande));
  brancher(canaux.convertirImage, (demande) => images.convertir(demande));
  brancher(canaux.listerImagesOrphelines, () => images.orphelines());
  brancher(canaux.retirerLeFond, (demande) => images.retirerLeFond(demande));
  brancher(canaux.copierImage, (demande) => images.copier(demande));
  brancher(canaux.apercuDuSite, (demande) => liens.apercuDuSite(demande));
  brancher(canaux.enregistrerFavicon, (demande) => liens.enregistrerFavicon(demande));

  brancher(canaux.exporter, (demande) => exports.exporter(demande));
  brancher(canaux.montrerExport, (demande) => exports.montrer(demande));
  brancher(canaux.lireImageDExport, (demande) => exports.lireImage(demande));

  brancher(canaux.mettreALaCorbeille, (demande) => corbeille.mettre(demande));
  brancher(canaux.mettreImageALaCorbeille, (demande) => corbeille.mettreImage(demande));
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
