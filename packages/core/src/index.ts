export { dossierParent, estDansDossier, joindreChemins, nomDeBase, verifierCheminRelatif } from './fs/paths';
export { LocalFsError } from './fs/local-fs';
export type { LocalEntry, LocalFs, LocalFsErrorCode } from './fs/local-fs';
export { RemoteFsError, versCodeErreur } from './fs/remote-fs';
export type { RemoteEntry, RemoteFs, RemoteFsErrorCode } from './fs/remote-fs';

export { estCheminAbsolu, lireReglages, reglagesParDefaut, validerReglagesNas } from './config/settings';
export type { NasSettings, NasSettingsField, NasSettingsValidation, Settings } from './config/settings';

export { estId, genererId } from './page/id';
export { longueurMaxTitre, nomDeDossier, nomLibre, titreParDefaut, verifierTitre } from './page/naming';
export { analyserPage, cheminDuFichierPage, lirePage } from './page/page-file';
export { fichierPage } from './page/types';
export type { PageFile, PageMeta, PageMode } from './page/types';

export { VaultError } from './vault/context';
export type { VaultContext, VaultErrorCode } from './vault/context';
export { importer } from './vault/import';
export { chargerPage, creerPage, deplacerPage, dupliquerPage, renommerPage } from './vault/operations';
export type { PageLocation } from './vault/operations';
export { indexerTitres } from './vault/titles-index';
export type { TitleEntry } from './vault/titles-index';
export { lireArbre, trouverNoeud } from './vault/tree';
export type { TreeNode } from './vault/tree';
