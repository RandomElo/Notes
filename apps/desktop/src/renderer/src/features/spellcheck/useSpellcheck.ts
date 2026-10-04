import { useEffect } from 'react';
import { api } from '../../lib/ipc';
import { magasinDeCorrection } from './spellcheck-store';

/**
 * Tient le magasin de la correction à jour (à monter une fois, dans App) :
 * état de LanguageTool envoyé par le main, et dictionnaire personnel, relu à
 * chaque changement du dossier des notes (un mot ajouté sur l'autre poste
 * arrive par la sync).
 */
export function useSpellcheck(): void {
  useEffect(() => {
    let actif = true;
    void api.etatCorrection().then((etat) => actif && magasinDeCorrection.definirEtat(etat));
    const lireLeDictionnaire = (): void => {
      void api.lireDictionnaire().then((mots) => actif && magasinDeCorrection.definirDictionnaire(mots));
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
