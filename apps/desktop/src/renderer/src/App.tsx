import type { TreeNode } from '@notes/core';
import { titreParDefaut } from '@notes/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageEditor } from './features/editor/PageEditor';
import { toutEnregistrer } from './features/editor/pending-saves';
import { PageSummary } from './features/page/PageSummary';
import { NasConnectionPanel } from './features/settings/NasConnectionPanel';
import { Sidebar } from './features/sidebar/Sidebar';
import { ThemeNotice } from './features/theme/ThemeNotice';
import { ThemePanel } from './features/theme/ThemePanel';
import { ThemeSummary } from './features/theme/ThemeSummary';
import { useTheme } from './features/theme/useTheme';
import { TitleBar } from './features/title-bar/TitleBar';
import { cleDeNoeud, clesDesAncetres, trouverParCle } from './features/sidebar/tree-model';
import { VaultChooser } from './features/welcome/VaultChooser';
import { api } from './lib/ipc';
import { estListeDeTextes, estTexteOuNull, useStoredState } from './state/useStoredState';
import { useVault } from './state/useVault';

/** Disposition générale : arborescence à gauche, éditeur de la page ouverte ou réglages au centre. */
export function App() {
  const vault = useVault();
  // undefined tant que l'état du vault n'est pas connu : le thème attend de savoir quel dossier lire.
  const theme = useTheme(vault.etat === null ? undefined : vault.etat.dossier);
  const [reglagesOuverts, definirReglagesOuverts] = useState(false);
  // L'éditeur de thème est un écran à part, auquel on arrive depuis les réglages.
  const [themeOuvert, definirThemeOuvert] = useState(false);
  const [selection, definirSelection] = useStoredState<string | null>('notes.selection', null, estTexteOuNull);
  const [listeDeplies, definirListeDeplies] = useStoredState<string[]>('notes.deplies', [], estListeDeTextes);
  const [renommage, definirRenommage] = useState<string | null>(null);
  // Page tout juste créée, en attente de son nom : une fois nommée, le curseur va dans son contenu.
  const creee = useRef<string | null>(null);
  const [aEcrire, definirAEcrire] = useState<string | null>(null);
  const contenuRejoint = useCallback(() => definirAEcrire(null), []);
  const deplies = useMemo(() => new Set(listeDeplies), [listeDeplies]);

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
      definirThemeOuvert(false);
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
      creee.current = page.id;
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

  // Fermeture de la fenêtre : la page ouverte est enregistrée avant que le main ne ferme pour de bon.
  useEffect(() => api.surFermetureDemandee(() => void toutEnregistrer().then(() => api.confirmerFermeture())), []);

  const sansVault = vault.etat !== null && vault.etat.dossier === null;

  return (
    <div className="flex h-full flex-col">
      <TitleBar dossier={vault.etat?.dossier ?? null} />

      <div className="flex min-h-0 flex-1">
        {vault.etat?.dossier != null && (
          <Sidebar
            vault={vault}
            selection={reglagesOuverts ? null : selection}
            surSelection={selectionner}
            deplies={deplies}
            surDepliage={(cle, deplie) => deplier([cle], deplie)}
            renommage={renommage}
            surRenommage={(cle) => {
              definirRenommage(cle);
              if (cle === null && creee.current !== null) {
                definirAEcrire(creee.current);
              }
              if (cle !== creee.current) {
                creee.current = null;
              }
            }}
            surCreation={(parent) => void creer(parent)}
            reglagesOuverts={reglagesOuverts}
            surReglages={() => {
              definirReglagesOuverts((ouverts) => !ouverts);
              definirThemeOuvert(false);
            }}
          />
        )}

        <main className="min-w-0 flex-1 overflow-y-auto px-6 pb-4">
          {vault.etat === null ? null : sansVault ? (
            <VaultChooser vault={vault} dossierPropose={vault.etat.dossierPropose} />
          ) : reglagesOuverts ? (
            themeOuvert ? (
              <div className="mx-auto max-w-5xl py-4">
                <ThemePanel theme={theme} surRetour={() => definirThemeOuvert(false)} />
              </div>
            ) : (
              <div className="mx-auto max-w-2xl space-y-10 py-4">
                <ThemeSummary theme={theme} surOuverture={() => definirThemeOuvert(true)} />
                <NasConnectionPanel />
              </div>
            )
          ) : noeudSelectionne?.importe === true ? (
            <PageEditor
              key={noeudSelectionne.id}
              noeud={noeudSelectionne}
              surRenommage={(titre) => api.renommerPage({ chemin: noeudSelectionne.chemin, titre }).then((resultat) => {
                if (!resultat.ok) {
                  return resultat.erreur.message;
                }
                void vault.recharger();
                return null;
              })}
              surSousPage={() => void creer(noeudSelectionne)}
              entrer={aEcrire === noeudSelectionne.id}
              surEntree={contenuRejoint}
              theme={theme.theme}
            />
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
      {!reglagesOuverts && (
        <ThemeNotice
          avertissements={theme.avertissements}
          surDetail={() => {
            definirReglagesOuverts(true);
            definirThemeOuvert(true);
          }}
        />
      )}
    </div>
  );
}
