import type { TreeNode } from '@notes/core';
import { titreParDefaut } from '@notes/core';
import { NotebookText } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageSummary } from './features/page/PageSummary';
import { NasConnectionPanel } from './features/settings/NasConnectionPanel';
import { Sidebar } from './features/sidebar/Sidebar';
import { cleDeNoeud, clesDesAncetres, trouverParCle } from './features/sidebar/tree-model';
import { VaultChooser } from './features/welcome/VaultChooser';
import { api } from './lib/ipc';
import { estListeDeTextes, estTexteOuNull, useStoredState } from './state/useStoredState';
import { useVault } from './state/useVault';

/** Disposition générale : arborescence à gauche, page ou réglages au centre. */
export function App() {
  const vault = useVault();
  const [version, definirVersion] = useState('');
  const [reglagesOuverts, definirReglagesOuverts] = useState(false);
  const [selection, definirSelection] = useStoredState<string | null>('notes.selection', null, estTexteOuNull);
  const [listeDeplies, definirListeDeplies] = useStoredState<string[]>('notes.deplies', [], estListeDeTextes);
  const [renommage, definirRenommage] = useState<string | null>(null);
  const deplies = useMemo(() => new Set(listeDeplies), [listeDeplies]);

  useEffect(() => {
    void api.version().then(definirVersion);
  }, []);

  const deplier = useCallback(
    (cles: string[], deplie = true) => {
      definirListeDeplies((precedente) => {
        const suivante = new Set(precedente);
        for (const cle of cles) {
          if (deplie) {
            suivante.add(cle);
          } else {
            suivante.delete(cle);
          }
        }
        return [...suivante];
      });
    },
    [definirListeDeplies],
  );

  const selectionner = useCallback(
    (cle: string) => {
      definirSelection(cle);
      definirReglagesOuverts(false);
    },
    [definirSelection],
  );

  /** Nouvelle page sous « parent » (null pour la racine), aussitôt en renommage comme dans Notion. */
  const creer = useCallback(
    async (parent: TreeNode | null) => {
      const page = await vault.creerPage(parent?.chemin ?? '', titreParDefaut);
      if (page === null) {
        return;
      }
      if (parent !== null) {
        deplier([cleDeNoeud(parent)]);
      }
      selectionner(page.id);
      definirRenommage(page.id);
    },
    [vault, deplier, selectionner],
  );

  const noeudSelectionne = trouverParCle(vault.arbre, selection);

  // Ctrl+N : sous-page de la page ouverte, ou page à la racine si aucune n'est ouverte.
  // Ctrl+Maj+N : toujours à la racine.
  const parentDeCreation = !reglagesOuverts && noeudSelectionne?.importe === true ? noeudSelectionne : null;
  useEffect(() => {
    const surTouche = (evenement: KeyboardEvent) => {
      if (evenement.ctrlKey && !evenement.altKey && evenement.key.toLowerCase() === 'n') {
        evenement.preventDefault();
        if (vault.etat?.dossier != null) {
          void creer(evenement.shiftKey ? null : parentDeCreation);
        }
      }
    };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [creer, vault.etat, parentDeCreation]);

  // La page ouverte doit rester visible dans l'arborescence, même après un déplacement.
  const cheminSelectionne = noeudSelectionne?.chemin;
  useEffect(() => {
    if (cheminSelectionne !== undefined) {
      const ancetres = clesDesAncetres(vault.arbre, cheminSelectionne);
      if (ancetres.some((cle) => !deplies.has(cle))) {
        deplier(ancetres);
      }
    }
    // Dépendance volontairement réduite : seul un changement d'emplacement de la page ouverte
    // doit rouvrir ses ancêtres, pas un repli fait à la main.
  }, [cheminSelectionne]);

  const sansVault = vault.etat !== null && vault.etat.dossier === null;

  return (
    <div className="flex h-full flex-col">
      <header className="border-bordure flex shrink-0 items-center gap-3 border-b px-4 py-3">
        <NotebookText className="text-accent size-5 shrink-0" aria-hidden="true" />
        <h1 className="shrink-0 text-base font-semibold">Notes</h1>
        {version !== '' && <span className="text-discret shrink-0 text-sm whitespace-nowrap">version {version}</span>}
        {vault.etat?.dossier != null && (
          <span className="text-discret ml-auto min-w-0 truncate text-xs" title={`Dossier des notes : ${vault.etat.dossier}`}>
            {vault.etat.dossier}
          </span>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        {vault.etat?.dossier != null && (
          <Sidebar
            vault={vault}
            selection={reglagesOuverts ? null : selection}
            surSelection={selectionner}
            deplies={deplies}
            surDepliage={(cle, deplie) => deplier([cle], deplie)}
            renommage={renommage}
            surRenommage={definirRenommage}
            surCreation={(parent) => void creer(parent)}
            reglagesOuverts={reglagesOuverts}
            surReglages={() => definirReglagesOuverts((ouverts) => !ouverts)}
          />
        )}

        <main className="min-w-0 flex-1 overflow-y-auto px-6 py-4">
          {vault.etat === null ? null : sansVault ? (
            <VaultChooser vault={vault} dossierPropose={vault.etat.dossierPropose} />
          ) : reglagesOuverts ? (
            <div className="mx-auto max-w-2xl py-4">
              <NasConnectionPanel />
            </div>
          ) : (
            <PageSummary
              noeud={noeudSelectionne}
              surCreation={() => void creer(null)}
              surImport={(noeud) => {
                void vault.importer(noeud.chemin).then((page) => page !== null && selectionner(page.id));
              }}
            />
          )}
        </main>
      </div>
    </div>
  );
}
