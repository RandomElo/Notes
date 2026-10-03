import type { TreeNode } from '@notes/core';
import { dossierParent, titreParDefaut, trouverNoeud } from '@notes/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConflictScreen } from './features/conflicts/ConflictScreen';
import { PageEditor } from './features/editor/PageEditor';
import { toutEnregistrer } from './features/editor/pending-saves';
import { PageSummary } from './features/page/PageSummary';
import { UnusedImages } from './features/images/UnusedImages';
import { WebpConversion } from './features/images/WebpConversion';
import { NasConnectionPanel } from './features/settings/NasConnectionPanel';
import { Sidebar } from './features/sidebar/Sidebar';
import { ThemeNotice } from './features/theme/ThemeNotice';
import { ThemePanel } from './features/theme/ThemePanel';
import { ThemeSummary } from './features/theme/ThemeSummary';
import { useTheme } from './features/theme/useTheme';
import { TitleBar } from './features/title-bar/TitleBar';
import { cleDeNoeud, clesDesAncetres, trouverParCle } from './features/sidebar/tree-model';
import { StatusBar } from './features/status-bar/StatusBar';
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
  // Version en conflit ouverte dans l'écran de résolution, à la place de la page.
  const [conflit, definirConflit] = useState<string | null>(null);
  // Augmente après une résolution : l'éditeur de la page repart du fichier enregistré.
  const [rechargements, definirRechargements] = useState(0);
  // Page tout juste créée, en attente de son nom : une fois nommée, le curseur va dans son contenu.
  const creee = useRef<string | null>(null);
  // Page ouverte avant la dernière création, rouverte si la nouvelle page est abandonnée par Échap.
  const avantCreation = useRef<string | null>(null);
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
      definirConflit(null);
    },
    [definirSelection],
  );

  /** Ouvre l'écran de résolution d'une version en conflit, depuis le bandeau de la page ou le détail de la sync. */
  const ouvrirConflit = useCallback(
    (sauvegarde: string) => {
      const page = trouverNoeud(vault.arbre, dossierParent(sauvegarde));
      if (page?.importe !== true) {
        return;
      }
      selectionner(cleDeNoeud(page));
      definirConflit(sauvegarde);
    },
    [vault.arbre, selectionner],
  );

  /**
   * Nouvelle page sous « parent » (null pour la racine), aussitôt en renommage comme dans Notion.
   * Sans « index », elle va en dernière position.
   */
  const creer = useCallback(
    async (parent: TreeNode | null, index?: number) => {
      const page = await vault.creerPage(parent?.chemin ?? '', titreParDefaut, index);
      if (page === null) {
        return;
      }
      if (parent !== null) {
        deplier([cleDeNoeud(parent)]);
      }
      avantCreation.current = selection;
      selectionner(page.id);
      creee.current = page.id;
      definirRenommage(page.id);
    },
    [vault, deplier, selectionner, selection],
  );

  /**
   * Échap sur le nom d'une page encore « Sans titre » : elle est supprimée si elle est vide, et la
   * page ouverte avant elle revient. Rend la clé de la ligne qui prend le focus, null si la page
   * avait quelque chose et reste en place.
   */
  const abandonnerPage = useCallback(
    async (noeud: TreeNode): Promise<string | null> => {
      const parent = trouverNoeud(vault.arbre, dossierParent(noeud.chemin));
      // Sans attendre : la fin du renommage, qui suit, enverrait sinon le curseur dans la page.
      creee.current = null;
      if ((await vault.supprimerPageVide(noeud.chemin)) === null) {
        return null;
      }
      const suivante = avantCreation.current ?? (parent === null ? null : cleDeNoeud(parent));
      avantCreation.current = null;
      if (selection === cleDeNoeud(noeud)) {
        definirSelection(suivante);
      }
      return suivante;
    },
    [vault, selection, definirSelection],
  );

  const noeudSelectionne = trouverParCle(vault.arbre, selection);

  // Ctrl+N : page sœur de la page ouverte, juste après elle, ou page à la racine si aucune n'est ouverte.
  // Ctrl+Maj+N : toujours à la racine.
  const pageDeReference = !reglagesOuverts && noeudSelectionne?.importe === true ? noeudSelectionne : null;
  useEffect(() => {
    const creerSoeur = (page: TreeNode) => {
      const parent = trouverNoeud(vault.arbre, dossierParent(page.chemin));
      // L'index se compte parmi les pages importées du parent, comme dans le core.
      const soeurs = (parent?.enfants ?? vault.arbre).filter((noeud) => noeud.importe);
      void creer(parent, soeurs.findIndex((noeud) => noeud.chemin === page.chemin) + 1);
    };
    const surTouche = (evenement: KeyboardEvent) => {
      if (evenement.ctrlKey && !evenement.altKey && evenement.key.toLowerCase() === 'n') {
        evenement.preventDefault();
        if (vault.etat?.dossier == null) {
          return;
        }
        if (evenement.shiftKey || pageDeReference === null) {
          void creer(null);
        } else {
          creerSoeur(pageDeReference);
        }
      }
    };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [creer, vault.etat, vault.arbre, pageDeReference]);

  // Échap dans les réglages : l'écran du thème revient aux réglages, les réglages reviennent à la page.
  // Un menu ou une liste ouverte qui traite Échap l'empêche d'aller plus loin.
  useEffect(() => {
    if (!reglagesOuverts) {
      return;
    }
    const surTouche = (evenement: KeyboardEvent) => {
      if (evenement.key !== 'Escape' || evenement.defaultPrevented) {
        return;
      }
      evenement.preventDefault();
      if (themeOuvert) {
        definirThemeOuvert(false);
      } else {
        definirReglagesOuverts(false);
      }
    };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [reglagesOuverts, themeOuvert]);

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
            surAbandon={abandonnerPage}
            reglagesOuverts={reglagesOuverts}
            surReglages={() => {
              definirReglagesOuverts((ouverts) => !ouverts);
              definirThemeOuvert(false);
            }}
          />
        )}

        {/* Marge gauche plus large que la droite : les poignées des blocs y tiennent sans toucher le panneau latéral. */}
        <main className="min-w-0 flex-1 overflow-y-auto pr-6 pb-4 pl-12">
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
                <WebpConversion />
                <UnusedImages />
              </div>
            )
          ) : noeudSelectionne?.importe === true && conflit !== null ? (
            <ConflictScreen
              key={conflit}
              sauvegarde={conflit}
              titre={noeudSelectionne.titre}
              surFermeture={(resolu) => {
                definirConflit(null);
                if (resolu) {
                  definirRechargements((nombre) => nombre + 1);
                }
              }}
            />
          ) : noeudSelectionne?.importe === true ? (
            <PageEditor
              key={`${noeudSelectionne.id}:${rechargements}`}
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
              surConflit={ouvrirConflit}
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
      <StatusBar surResolution={ouvrirConflit} />
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
