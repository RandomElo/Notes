export { dossierParent, estDansDossier, joindreChemins, nomDeBase, verifierCheminRelatif } from './fs/paths';
export { LocalFsError } from './fs/local-fs';
export type { LocalEntry, LocalFs, LocalFsErrorCode } from './fs/local-fs';
export { RemoteFsError, versCodeErreur } from './fs/remote-fs';
export type { RemoteEntry, RemoteFs, RemoteFsErrorCode } from './fs/remote-fs';

export { estCheminAbsolu, estIdentifiantDAppareil, lireReglages, reglagesParDefaut, validerReglagesNas } from './config/settings';
export type { NasSettings, NasSettingsField, NasSettingsValidation, Settings } from './config/settings';

export { estId, genererId } from './page/id';
export { longueurMaxTitre, nomDeDossier, nomLibre, titreParDefaut, verifierTitre } from './page/naming';
export { analyserPage, cheminDuFichierPage, lirePage } from './page/page-file';
export { natureDIcone } from './page/icon';
export type { PageIcon } from './page/icon';
export { fichierPage } from './page/types';
export type { PageFile, PageMeta, PageMode, PageRole } from './page/types';

export { aUneExtensionDImage, ajouterImage, dossierAssets, extensionsDImage, listerImagesOrphelines, natureDImage, tailleMaxAvantConversion, tailleMaxDImage } from './vault/assets';
export type { ImageKind } from './vault/assets';
export { listerImagesAConvertir, naturesAConvertir, nomEnWebp, remplacerImageDansTexte, remplacerParWebp } from './vault/image-conversion';
export type { ImageToConvert } from './vault/image-conversion';
export { VaultError } from './vault/context';
export type { VaultContext, VaultErrorCode } from './vault/context';
export { enregistrerCorps, lireContenu, lireCorps } from './vault/content';
export type { PageContent, SaveRequest, SaveResult } from './vault/content';
export { estFichierDeConflitDePage, lireConflit, listerConflits, resoudreConflit } from './vault/conflicts';
export type { ConflictVersions } from './vault/conflicts';
export { importer } from './vault/import';
export { chargerPage, creerPage, deplacerPage, deplacerPages, dupliquerPage, renommerPage, supprimerPageVide } from './vault/operations';
export type { PageLocation } from './vault/operations';
export { mentionsCassees, mentionsDuCorps, pagesQuiMentionnent, reecrireCorps } from './vault/links';
export type { BrokenMention, MentionFound } from './vault/links';
export { cheminDeFavicon, dossierFavicons, enregistrerFavicon } from './vault/favicons';
export { ajouterAuDictionnaire, ajouterAuxIgnores, fichierDesIgnores, fichierDuDictionnaire, ligneDIgnore, lireDictionnaire, lireIgnores, motValide, motsDuDictionnaire } from './vault/dictionary';
export type { IgnoredRemark } from './vault/dictionary';
export { ajouterIconeImage, changerIcone } from './vault/icon';
export { changerMode } from './vault/page-mode';
export { indexerTitres } from './vault/titles-index';
export type { TitleEntry } from './vault/titles-index';
export { lireArbre, trouverNoeud } from './vault/tree';
export type { TreeNode } from './vault/tree';

export { sousDossierDistant } from './fs/remote-subdir';
export { versOctets, versTexte } from './fs/utf8';
export { estSauvegardeDeConflit } from './sync/conflict';
export { etatLocalDePage, synchroniser } from './sync/engine';
export type { CycleReport, SyncContext } from './sync/engine';
export type { IndexStore } from './sync/index-store';
export { LockManager, dureeDeVieDuVerrouMs, inactiviteAvantRelacheMs } from './sync/lock';
export type { LocalPageState, LockOwner, LockState, TakeResult } from './sync/lock';
export { etatApresCycle, etatApresEchec, etatDesactive, etatEnCours, messageInjoignable } from './sync/status';
export type { SyncStatus, SyncStatusKind } from './sync/status';
export {
  dossierCorbeille,
  estNomDEntree,
  listerCorbeille,
  lireApercu,
  mettreALaCorbeille,
  mettreImageALaCorbeille,
  mettreMemoALaCorbeille,
  placeDOrigine,
  purgerCorbeille,
  rapatrierEntree,
  restaurerEntree,
  retentionCorbeilleMs,
  stockageDistant,
  stockageLocal,
  supprimerEntree,
  transfererCorbeille,
  viderCorbeille,
} from './trash/trash';
export type { TrashEntry, TrashKind, TrashPreview, TrashStorage } from './trash/trash';
export { classerParTitre, correspondanceFloue, normaliserPourRecherche } from './search/fuzzy';
export type { FuzzyMatch, RankedResult } from './search/fuzzy';
export { ajouterALHistoriqueIa, appelsDuFichier, fichierDHistoriqueIa, fusionnerAppels, lireAppel, lireHistoriqueIa } from './ai/usage';
export type { AiEstimate, AiFunction, AiProvider, AiRun } from './ai/usage';
export { calibrer, debutDePeriode, depenseDeLaPeriode, ratioDeSortieParDefaut, totauxParPeriode } from './ai/usage-stats';
export type { Calibration, UsageBucket, UsagePeriod } from './ai/usage-stats';
export { adresseDeServiceValide, adresseOllamaParDefaut, fonctionsDePage, lireReglagesIa, nomDeModeleValide, reglagesIaParDefaut } from './config/ai-settings';
export type { AiModelChoice, AiPageFunction, AiPrice, AiSettings } from './config/ai-settings';
export {
  cheminDeMemoValide,
  creerPageDeMemo,
  dateDuNom,
  dossierDesMemos,
  estFichierAudio,
  listerMemos,
  nomDeMemo,
  pageDesMemos,
  pageDesMemosMasquee,
  titreDeLaPageDesMemos,
  titreDuMemo,
  trouverPageDesMemos,
} from './memos/memos';
export type { VoiceMemo } from './memos/memos';
