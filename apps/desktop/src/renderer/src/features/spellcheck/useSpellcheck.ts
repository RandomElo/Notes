import { useEffect } from 'react';
import { api } from '../../lib/ipc';
import type { SpellIssue } from '../../../../shared/ipc-contract';
import { magasinDeCorrection } from './spellcheck-store';

/**
 * Tient le magasin de la correction à jour (à monter une fois, dans App) :
 * état de LanguageTool envoyé par le main, dictionnaire personnel et
 * remarques ignorées, relus à chaque changement du dossier des notes (un mot
 * ajouté sur l'autre poste arrive par la sync).
 */
export function useSpellcheck(): void {
  useEffect(() => {
    let actif = true;
    void api.etatCorrection().then((etat) => actif && magasinDeCorrection.definirEtat(etat));
    const lireLeDictionnaire = (): void => {
      void api.lireDictionnaire().then((mots) => actif && magasinDeCorrection.definirDictionnaire(mots));
      void api.lireIgnores().then((remarques) => actif && magasinDeCorrection.definirIgnores(remarques));
    };
    lireLeDictionnaire();
    const sansEtat = api.surEtatCorrection(magasinDeCorrection.definirEtat);
    const sansVault = api.surVaultModifie(lireLeDictionnaire);
    return () => {
      actif = false;
      sansEtat();
      sansVault();
    };
  }, []);
}

/** « Ignorer » : la remarque disparaît tout de suite, et reste écartée pour toujours, sur tous les postes. */
export function ignorerLaRemarque(faute: SpellIssue): void {
  magasinDeCorrection.ignorer(faute);
  void api.ignorerRemarque({ regle: faute.regle, mot: faute.mot }).then(magasinDeCorrection.definirIgnores);
}
