import type { PageLocation, TreeNode } from '@notes/core';
import { useCallback, useEffect, useState } from 'react';
import type { VaultOperationResult, VaultState } from '../../../shared/ipc-contract';
import { api } from '../lib/ipc';

/**
 * État du vault côté écran : dossier ouvert, arborescence, dernière erreur.
 * L'arbre vient toujours du main, jamais d'une modification locale.
 */
export function useVault() {
  const [etat, definirEtat] = useState<VaultState | null>(null);
  const [arbre, definirArbre] = useState<TreeNode[]>([]);
  const [erreur, definirErreur] = useState<string | null>(null);

  const recharger = useCallback(async () => {
    try {
      definirArbre(await api.lireArbre());
    } catch {
      definirErreur("L'arborescence n'a pas pu être lue.");
    }
  }, []);

  useEffect(() => {
    void api.etatVault().then((recu) => {
      definirEtat(recu);
      if (recu.dossier !== null) {
        void recharger();
      }
    });
    // Un autre outil, ou la sync, a modifié le vault : on relit.
    return api.surVaultModifie(() => void recharger());
  }, [recharger]);

  /** Applique le résultat d'une opération : arbre à jour, ou message d'erreur. */
  const appliquer = useCallback((resultat: VaultOperationResult): PageLocation | null => {
    if (!resultat.ok) {
      definirErreur(resultat.erreur.message);
      return null;
    }
    definirErreur(null);
    definirArbre(resultat.arbre);
    return resultat.page;
  }, []);

  const ouvrirDossier = useCallback(
    async (choix: 'choisir' | 'propose') => {
      const recu = await (choix === 'choisir' ? api.choisirDossierVault() : api.utiliserDossierPropose());
      if ('ok' in recu) {
        definirErreur(recu.erreur.message);
        return;
      }
      definirErreur(null);
      definirEtat(recu);
      if (recu.dossier !== null) {
        await recharger();
      }
    },
    [recharger],
  );

  return {
    etat,
    arbre,
    erreur,
    fermerErreur: useCallback(() => definirErreur(null), []),
    ouvrirDossier,
    creerPage: useCallback(
      async (parent: string, titre: string) => appliquer(await api.creerPage({ parent, titre })),
      [appliquer],
    ),
    renommerPage: useCallback(
      async (chemin: string, titre: string) => appliquer(await api.renommerPage({ chemin, titre })),
      [appliquer],
    ),
    deplacerPage: useCallback(
      async (chemin: string, parent: string, index: number) => appliquer(await api.deplacerPage({ chemin, parent, index })),
      [appliquer],
    ),
    dupliquerPage: useCallback(async (chemin: string) => appliquer(await api.dupliquerPage({ chemin })), [appliquer]),
    importer: useCallback(async (chemin: string) => appliquer(await api.importer({ chemin })), [appliquer]),
  };
}

export type Vault = ReturnType<typeof useVault>;
