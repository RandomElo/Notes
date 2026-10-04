import type { TreeNode } from '@notes/core';
import { dossierParent, titreParDefaut, trouverNoeud } from '@notes/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConflictScreen } from './features/conflicts/ConflictScreen';
import { PageEditor } from './features/editor/PageEditor';
import { BrokenMentions } from './features/mentions/BrokenMentions';
import { IconPicker } from './features/page-icon/IconPicker';
import { annuaireDesPages } from './features/mentions/pages-directory';
import { renommerEnSuivantLesMentions } from './features/mentions/rename-follow';
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
import { GlobalShortcutPanel } from './features/search/GlobalShortcutPanel';
import { demandeDeCreation } from './features/search/creation-place';
import { ajouterRecente } from './features/search/recent-pages';
import { SearchPalette } from './features/search/SearchPalette';
import { TabBar } from './features/tabs/TabBar';
import { ajouter, estEtatDOnglets, etatInitial, fermer, ongletActif, ouvrir, parNumero, remplacer, voisin } from './features/tabs/tabs-model';
import type { TabsState } from './features/tabs/tabs-model';
import { usePendingPages } from './features/tabs/usePendingPages';
import { VaultChooser } from './features/welcome/VaultChooser';
import { api } from './lib/ipc';
import { estBooleen, estListeDeTextes, useStoredState } from './state/useStoredState';
import { useVault } from './state/useVault';

/**
 * Onglets du premier lancement de cette version : la page ouverte jusqu'ici
 * (`notes.selection`, d'avant les onglets) devient le premier onglet.
 */
function ongletsDeDepart(): TabsState {
  try {
    const ancienne: unknown = JSON.parse(window.localStorage.getItem('notes.selection') ?? 'null');
    return etatInitial(typeof ancienne === 'string' ? ancienne : null);
  } catch {
    return etatInitial(null);
  }
}

/** Disposition générale : arborescence à gauche, éditeur de la page ouverte ou réglages au centre. */
export function App() {
  const vault = useVault();
  // undefined tant que l'état du vault n'est pas connu : le thème attend de savoir quel dossier lire.
  const theme = useTheme(vault.etat === null ? undefined : vault.etat.dossier);
  const [reglagesOuverts, definirReglagesOuverts] = useState(false);
  // L'éditeur de thème est un écran à part, auquel on arrive depuis les réglages.
  const [themeOuvert, definirThemeOuvert] = useState(false);
  const [onglets, definirOnglets] = useStoredState<TabsState>('notes.onglets', ongletsDeDepart(), estEtatDOnglets);
  const selection = ongletActif(onglets).cle;
  // Page de l'onglet affiché, changée sans chercher dans les autres onglets (abandon d'une page neuve).
  const definirSelection = useCallback((cle: string | null) => definirOnglets((etat) => remplacer(etat, cle)), [definirOnglets]);
  const [recentes, definirRecentes] = useStoredState<string[]>('notes.recentes', [], estListeDeTextes);
  const [barreVisible, definirBarreVisible] = useStoredState<boolean>('notes.barre-laterale', true, estBooleen);
  const [sommaireVisible, definirSommaireVisible] = useStoredState<boolean>('notes.sommaire', true, estBooleen);
  const [rechercheOuverte, definirRechercheOuverte] = useState(false);
  const [listeDeplies, definirListeDeplies] = useStoredState<string[]>('notes.deplies', [], estListeDeTextes);
  const [renommage, definirRenommage] = useState<string | null>(null);
  // Choix de l'icône d'une page ouvert, depuis le haut de la page ou le menu de l'arborescence.
  const [choixDIcone, definirChoixDIcone] = useState<{ chemin: string; icone: string | null; x: number; y: number } | null>(null);
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
  const fermerChoixDIcone = useCallback(() => definirChoixDIcone(null), []);

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

  /** Ouvre une page : dans son onglet s'il y en a un, sinon dans l'onglet affiché ou un nouveau. */
  const selectionner = useCallback(
    (cle: string, nouvelOnglet = false) => {
      definirOnglets((etat) => ouvrir(etat, cle, nouvelOnglet));
      definirReglagesOuverts(false);
      definirThemeOuvert(false);
      definirConflit(null);
    },
    [definirOnglets],
  );

  /** Change d'onglet, ou en ferme un : les réglages et l'écran des conflits laissent la place à la page. */
  const changerDOnglets = useCallback(
    (changement: (etat: TabsState) => TabsState) => {
      definirOnglets(changement);
      definirReglagesOuverts(false);
      definirThemeOuvert(false);
      definirConflit(null);
    },
    [definirOnglets],
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

  // Les mentions lisent titres et icônes dans l'annuaire des pages, tenu à jour depuis l'arborescence.
  useEffect(() => {
    annuaireDesPages.definirArbre(vault.arbre);
  }, [vault.arbre]);
  useEffect(() => {
    annuaireDesPages.recentes = recentes;
  }, [recentes]);

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

  // Raccourcis de l'application (annexe du README). En capture : l'éditeur ne doit pas les prendre pour lui.
  // Ils ne valent pas dans une fenêtre de recherche ou de sommaire, qui a ses propres touches.
  useEffect(() => {
    const surTouche = (evenement: KeyboardEvent) => {
      if (!evenement.ctrlKey || evenement.altKey || evenement.metaKey || document.querySelector('[aria-modal="true"]') !== null) {
        return;
      }
      const touche = evenement.key.toLowerCase();
      // Ctrl+Maj+\ donne « | » sur un clavier français : la touche physique est plus sûre.
      const barreOblique = evenement.code === 'Backslash' || evenement.code === 'IntlBackslash' || touche === '\\';
      let action: (() => void) | null = null;
      if (touche === 'k' && !evenement.shiftKey) {
        action = () => definirRechercheOuverte(true);
      } else if (touche === 't' && !evenement.shiftKey) {
        action = () => {
          changerDOnglets((etat) => ajouter(etat));
          definirRechercheOuverte(true);
        };
      } else if (touche === 'w' && !evenement.shiftKey) {
        action = () => changerDOnglets((etat) => fermer(etat, etat.actif));
      } else if (evenement.key === 'Tab') {
        action = () => changerDOnglets((etat) => voisin(etat, evenement.shiftKey ? -1 : 1));
      } else if (/^Digit[1-9]$/.test(evenement.code) && !evenement.shiftKey) {
        action = () => changerDOnglets((etat) => parNumero(etat, Number(evenement.code.slice(5))));
      } else if (barreOblique) {
        action = evenement.shiftKey ? () => definirSommaireVisible((visible) => !visible) : () => definirBarreVisible((visible) => !visible);
      } else if (touche === 'q' && !evenement.shiftKey) {
        action = () => void api.quitterNotes();
      } else if (touche === ',' && !evenement.shiftKey) {
        action = () => {
          definirReglagesOuverts((ouverts) => !ouverts);
          definirThemeOuvert(false);
        };
      }
      if (action !== null) {
        evenement.preventDefault();
        evenement.stopPropagation();
        action();
      }
    };
    window.addEventListener('keydown', surTouche, true);
    return () => window.removeEventListener('keydown', surTouche, true);
  }, [changerDOnglets, definirBarreVisible, definirSommaireVisible]);

  // Page choisie dans la petite fenêtre du raccourci global : elle s'ouvre ici, comme depuis Ctrl+K.
  useEffect(() => {
    const prendre = (): void => {
      void api.prendrePageDemandee().then((demande) => {
        if (demande !== null) {
          definirRechercheOuverte(false);
          selectionner(demande.id, demande.nouvelOnglet);
          definirAEcrire(demande.id);
        }
      });
    };
    prendre();
    return api.surPageDemandee(prendre);
  }, [selectionner]);

  // Pages récentes de la recherche : chaque page ouverte passe en tête.
  useEffect(() => {
    if (selection !== null && trouverParCle(vault.arbre, selection)?.importe === true) {
      definirRecentes((liste) => (liste[0] === selection ? liste : ajouterRecente(liste, selection)));
    }
  }, [selection, vault.arbre, definirRecentes]);

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

  // Titre et chemin de la page de chaque onglet ; un onglet dont la page n'existe plus reste, vide.
  const pagesDesOnglets = onglets.onglets.map((onglet) => ({ onglet, noeud: trouverParCle(vault.arbre, onglet.cle) }));
  const enAttente = usePendingPages(pagesDesOnglets.flatMap(({ noeud }) => (noeud?.importe === true ? [noeud.chemin] : [])));
  const barreDOnglets =
    vault.etat?.dossier == null ? null : (
      <TabBar
        onglets={pagesDesOnglets.map(({ onglet, noeud }) => ({
          ...onglet,
          titre: noeud?.titre ?? 'Nouvel onglet',
          icone: noeud?.icone ?? null,
          chemin: noeud?.chemin ?? '',
          enAttente: noeud?.importe === true && enAttente.has(noeud.chemin),
        }))}
        actif={onglets.actif}
        surActivation={(id) => changerDOnglets((etat) => ({ ...etat, actif: id }))}
        surFermeture={(id) => changerDOnglets((etat) => fermer(etat, id))}
        surNouveau={() => {
          changerDOnglets((etat) => ajouter(etat));
          definirRechercheOuverte(true);
        }}
      />
    );

  return (
    <div className="flex h-full flex-col">
      <TitleBar dossier={vault.etat?.dossier ?? null}>{barreDOnglets}</TitleBar>

      <div className="flex min-h-0 flex-1">
        {vault.etat?.dossier != null && barreVisible && (
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
            surIcone={(noeud, x, y) => definirChoixDIcone({ chemin: noeud.chemin, icone: noeud.icone, x, y })}
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
                <GlobalShortcutPanel />
                <WebpConversion />
                <UnusedImages />
                <BrokenMentions
                  surOuverture={(chemin) => {
                    const page = trouverNoeud(vault.arbre, chemin);
                    if (page !== null) {
                      selectionner(cleDeNoeud(page));
                    }
                  }}
                />
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
              surRenommage={(titre) => renommerEnSuivantLesMentions(noeudSelectionne.chemin, titre).then((resultat) => {
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
              sommaireVisible={sommaireVisible}
              surOuvrirPage={selectionner}
              surIcone={(x, y) => definirChoixDIcone({ chemin: noeudSelectionne.chemin, icone: noeudSelectionne.icone, x, y })}
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
      {choixDIcone !== null && (
        <IconPicker
          icone={choixDIcone.icone}
          x={choixDIcone.x}
          y={choixDIcone.y}
          surChoix={(choix) => vault.changerIcone(choixDIcone.chemin, choix.genre === 'image' ? { octets: choix.octets } : { icone: choix.icone })}
          surFermeture={fermerChoixDIcone}
        />
      )}
      {rechercheOuverte && vault.etat?.dossier != null && (
        <SearchPalette
          arbre={vault.arbre}
          recentes={recentes}
          pageOuverte={reglagesOuverts ? null : noeudSelectionne}
          surChoix={(id, nouvelOnglet) => {
            definirRechercheOuverte(false);
            selectionner(id, nouvelOnglet);
            definirAEcrire(id);
          }}
          surCreation={async (titre, ou) => {
            const resultat = await api.creerPage({ ...demandeDeCreation(vault.arbre, reglagesOuverts ? null : noeudSelectionne, ou), titre });
            if (!resultat.ok) {
              return resultat.erreur.message;
            }
            await vault.recharger();
            definirRechercheOuverte(false);
            selectionner(resultat.page.id);
            definirAEcrire(resultat.page.id);
            return null;
          }}
          surFermeture={() => definirRechercheOuverte(false)}
        />
      )}
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
