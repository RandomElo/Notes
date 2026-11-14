import type { TreeNode } from '@notes/core';
import { dossierParent, titreParDefaut, trouverNoeud } from '@notes/core';
import { ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConflictScreen } from './features/conflicts/ConflictScreen';
import { PageEditor } from './features/editor/PageEditor';
import { PageErrorBoundary } from './features/error-log/PageErrorBoundary';
import { BrokenMentions } from './features/mentions/BrokenMentions';
import { ExportDialog } from './features/export/ExportDialog';
import { IconPicker } from './features/page-icon/IconPicker';
import { annuaireDesPages } from './features/mentions/pages-directory';
import { renommerEnSuivantLesMentions } from './features/mentions/rename-follow';
import { toutEnregistrer } from './features/editor/pending-saves';
import { PageSummary } from './features/page/PageSummary';
import { UnusedFiles } from './features/unused-files/UnusedFiles';
import { WebpConversion } from './features/images/WebpConversion';
import { SettingsScreen } from './features/settings/SettingsScreen';
import { NotionImportPanel } from './features/notion-import/NotionImportPanel';
import { NasConnectionPanel } from './features/settings/NasConnectionPanel';
import { Sidebar } from './features/sidebar/Sidebar';
import { ThemeNotice } from './features/theme/ThemeNotice';
import { ThemePanel } from './features/theme/ThemePanel';
import { ThemeSummary } from './features/theme/ThemeSummary';
import { useTheme } from './features/theme/useTheme';
import { TitleBar } from './features/title-bar/TitleBar';
import { TrashScreen } from './features/trash/TrashScreen';
import { cleDeNoeud, clesDesAncetres, trouverParCle } from './features/sidebar/tree-model';
import { StatusBar } from './features/status-bar/StatusBar';
import { AiPanel } from './features/ai/AiPanel';
import { AiUsageScreen } from './features/ai/AiUsageScreen';
import { useMemos } from './features/voice-memos/useMemos';
import { ajouterRecente } from './features/mentions/recent-pages';
import { ajouterALaPageOuverte, peutAjouter } from './features/markdown-drop/append-target';
import { MarkdownDropDialog } from './features/markdown-drop/MarkdownDropDialog';
import { SpellcheckPanel } from './features/spellcheck/SpellcheckPanel';
import { useSpellcheck } from './features/spellcheck/useSpellcheck';
import { PageSearch } from './features/page-search/PageSearch';
import { PageSearchDialog } from './features/page-search/PageSearchDialog';
import { compterOuverture, estCompteDOuvertures } from './features/page-search/page-suggestions';
import type { OpenCounts } from './features/page-search/page-suggestions';
import { TabBar } from './features/tabs/TabBar';
import { ajouter, deplacer, estEtatDOnglets, etatInitial, fermer, fermerLesPages, ongletActif, ouvrir } from './features/tabs/tabs-model';
import type { TabsState } from './features/tabs/tabs-model';
import { usePendingPages } from './features/tabs/usePendingPages';
import { VaultChooser } from './features/welcome/VaultChooser';
import { api } from './lib/ipc';
import { estBooleen, estListeDeTextes, estNombreOuNull, useStoredState } from './state/useStoredState';
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
  // Mémos vocaux (docs/spec/memos.md) : la page « Mémos vocaux » peut être masquée de l'arborescence sur ce poste.
  const memos = useMemos();
  const memosMasques = memos.etat?.masquee === true;
  const vaultAffiche = useMemo(() => (memosMasques ? { ...vault, arbre: vault.arbre.filter((noeud) => noeud.role !== 'memos') } : vault), [vault, memosMasques]);
  // undefined tant que l'état du vault n'est pas connu : le thème attend de savoir quel dossier lire.
  const theme = useTheme(vault.etat === null ? undefined : vault.etat.dossier);
  useSpellcheck();
  const [reglagesOuverts, definirReglagesOuverts] = useState(false);
  // L'éditeur de thème est un écran à part, auquel on arrive depuis les réglages.
  const [themeOuvert, definirThemeOuvert] = useState(false);
  // La corbeille remplace la page au centre, comme les réglages (docs/spec/corbeille.md).
  const [corbeilleOuverte, definirCorbeilleOuverte] = useState(false);
  // L'historique des fonctions IA remplace aussi la page au centre (docs/spec/ia.md).
  const [historiqueIaOuvert, definirHistoriqueIaOuvert] = useState(false);
  const ouvrirHistoriqueIa = useCallback(() => {
    definirHistoriqueIaOuvert(true);
    definirReglagesOuverts(false);
    definirCorbeilleOuverte(false);
  }, []);
  const [onglets, definirOnglets] = useStoredState<TabsState>('notes.onglets', ongletsDeDepart(), estEtatDOnglets);
  const selection = ongletActif(onglets)?.cle ?? null;
  const [recentes, definirRecentes] = useStoredState<string[]>('notes.recentes', [], estListeDeTextes);
  // Ouvertures de chaque page, pour les suggestions de la recherche de pages.
  const [ouvertures, definirOuvertures] = useStoredState<OpenCounts>('notes.ouvertures', {}, estCompteDOuvertures);
  const derniereComptee = useRef<string | null>(null);
  // Fenêtre de recherche de Notes, quand la barre de recherche du poste n'est pas installée.
  const [rechercheOuverte, definirRechercheOuverte] = useState(false);
  /** La barre de recherche du poste (`../BarreRecherche`), sinon la recherche de Notes (docs/spec/interface.md). */
  const ouvrirLaRecherche = useCallback(() => {
    void api.ouvrirBarreDeRecherche().then((ouverte) => {
      if (!ouverte) {
        definirRechercheOuverte(true);
      }
    });
  }, []);
  // Fichiers Markdown déposés dans la fenêtre, en attente de la réponse : pages ou ajout à la page ouverte.
  const [depot, definirDepot] = useState<{ fichiers: string[]; noms: string[]; ajoutPossible: boolean } | null>(null);
  const [barreVisible, definirBarreVisible] = useStoredState<boolean>('notes.barre-laterale', true, estBooleen);
  const [largeurDeBarre, definirLargeurDeBarre] = useStoredState<number | null>('notes.largeur-barre-laterale', null, estNombreOuNull);
  const [listeDeplies, definirListeDeplies] = useStoredState<string[]>('notes.deplies', [], estListeDeTextes);
  const [renommage, definirRenommage] = useState<string | null>(null);
  // Choix de l'icône d'une page ouvert, depuis le haut de la page ou le menu de l'arborescence.
  // Page dont la fenêtre d'export est ouverte, par son chemin : le nœud est relu dans l'arbre à jour.
  const [exportDe, definirExportDe] = useState<string | null>(null);
  const noeudAExporter = exportDe === null ? null : trouverNoeud(vault.arbre, exportDe);
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
      definirCorbeilleOuverte(false);
      definirHistoriqueIaOuvert(false);
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
      definirCorbeilleOuverte(false);
      definirHistoriqueIaOuvert(false);
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
      // Une page créée s'ouvre dans un nouvel onglet, comme une page ouverte depuis l'arborescence.
      selectionner(page.id, true);
      creee.current = page.id;
      definirRenommage(page.id);
    },
    [vault, deplier, selectionner, selection],
  );

  /**
   * Échap sur le nom d'une page encore « Sans titre » : elle est supprimée si elle est vide, son
   * onglet se ferme et la page ouverte avant elle revient. Rend la clé de la ligne qui prend le focus, null si la page
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
        definirOnglets((etat) => {
          const sansElle = etat.actif === null ? etat : fermer(etat, etat.actif);
          return suivante === null ? sansElle : ouvrir(sansElle, suivante);
        });
      }
      return suivante;
    },
    [vault, selection, definirOnglets],
  );

  /**
   * Met des pages à la corbeille. La page ouverte est d'abord enregistrée : sa dernière frappe part
   * avec elle. Les onglets de ces pages et de leurs sous-pages se ferment.
   */
  const mettreALaCorbeille = useCallback(
    async (noeuds: TreeNode[]): Promise<boolean> => {
      await toutEnregistrer();
      const retirees = new Set<string>();
      const relever = (noeud: TreeNode): void => {
        retirees.add(cleDeNoeud(noeud));
        noeud.enfants.forEach(relever);
      };
      noeuds.forEach(relever);
      const fait = await vault.mettreALaCorbeille(noeuds.map((noeud) => noeud.chemin));
      if (fait) {
        definirOnglets((etat) => fermerLesPages(etat, retirees));
      }
      return fait;
    },
    [vault, definirOnglets],
  );

  // Les mentions lisent titres et icônes dans l'annuaire des pages, tenu à jour depuis l'arborescence.
  useEffect(() => {
    annuaireDesPages.definirArbre(vault.arbre);
  }, [vault.arbre]);
  useEffect(() => {
    annuaireDesPages.recentes = recentes;
  }, [recentes]);

  const noeudSelectionne = trouverParCle(vault.arbre, selection);

  // Ctrl+Maj+F : la barre de recherche du poste, sur les pages de Notes (son Ctrl+K marche aussi, pris par elle).
  useEffect(() => {
    const surTouche = (evenement: KeyboardEvent) => {
      if (evenement.ctrlKey && evenement.shiftKey && !evenement.altKey && evenement.code === 'KeyF') {
        evenement.preventDefault();
        ouvrirLaRecherche();
      }
    };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [ouvrirLaRecherche]);

  // Ctrl+N : page sœur de la page ouverte, juste après elle, ou page à la racine si aucune n'est ouverte.
  // Ctrl+Maj+N : toujours à la racine.
  const pageDeReference = !reglagesOuverts && !corbeilleOuverte && !historiqueIaOuvert && noeudSelectionne?.importe === true ? noeudSelectionne : null;
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


  // Un fichier Markdown déposé n'importe où dans la fenêtre : la question s'ouvre (docs/spec/interface.md).
  // Les images déposées dans la page restent à l'éditeur, qui les copie lui-même.
  useEffect(() => {
    const survol = (evenement: DragEvent): void => {
      if (evenement.dataTransfer?.types.includes('Files') === true) {
        evenement.preventDefault();
      }
    };
    const depose = (evenement: DragEvent): void => {
      const fichiers = [...(evenement.dataTransfer?.files ?? [])].filter((fichier) => /\.(md|markdown)$/i.test(fichier.name));
      if (fichiers.length === 0) {
        return;
      }
      evenement.preventDefault();
      evenement.stopPropagation();
      const chemins = fichiers.map((fichier) => api.cheminDuFichier(fichier)).filter((chemin) => chemin !== '');
      if (chemins.length > 0) {
        definirDepot({ fichiers: chemins, noms: fichiers.map((fichier) => fichier.name), ajoutPossible: peutAjouter() });
      }
    };
    window.addEventListener('dragover', survol, true);
    window.addEventListener('drop', depose, true);
    return () => {
      window.removeEventListener('dragover', survol, true);
      window.removeEventListener('drop', depose, true);
    };
  }, []);

  // Page demandée par la barre de recherche du poste (`--page=<id>`), au lancement ou Notes déjà ouverte.
  useEffect(() => {
    const prendre = (): void => {
      void api.prendrePageDemandee().then((id) => {
        if (id !== null) {
          selectionner(id);
          definirAEcrire(id);
        }
      });
    };
    prendre();
    return api.surPageDemandee(prendre);
  }, [selectionner]);

  // Pages récentes, proposées d'abord par les mentions : chaque page ouverte passe en tête.
  useEffect(() => {
    if (selection !== null && trouverParCle(vault.arbre, selection)?.importe === true) {
      definirRecentes((liste) => (liste[0] === selection ? liste : ajouterRecente(liste, selection)));
      // Une ouverture par changement de page, pas à chaque relecture de l'arborescence.
      if (derniereComptee.current !== selection) {
        derniereComptee.current = selection;
        definirOuvertures((comptes) => compterOuverture(comptes, selection));
      }
    } else if (selection === null) {
      derniereComptee.current = null;
    }
  }, [selection, vault.arbre, definirRecentes, definirOuvertures]);

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

  // Échap dans l'historique des fonctions IA : la page revient.
  useEffect(() => {
    if (!historiqueIaOuvert) {
      return;
    }
    const surTouche = (evenement: KeyboardEvent) => {
      if (evenement.key === 'Escape' && !evenement.defaultPrevented) {
        evenement.preventDefault();
        definirHistoriqueIaOuvert(false);
      }
    };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [historiqueIaOuvert]);

  // Échap dans la corbeille : la page revient. Une fenêtre de confirmation ouverte le traite avant.
  useEffect(() => {
    if (!corbeilleOuverte) {
      return;
    }
    const surTouche = (evenement: KeyboardEvent) => {
      if (evenement.key === 'Escape' && !evenement.defaultPrevented) {
        evenement.preventDefault();
        definirCorbeilleOuverte(false);
      }
    };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [corbeilleOuverte]);

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
        surNouveau={() => changerDOnglets((etat) => ajouter(etat))}
        surDeplacement={(id, rang) => definirOnglets((etat) => deplacer(etat, id, rang))}
      />
    );

  return (
    <div className="flex h-full flex-col">
      <TitleBar dossier={vault.etat?.dossier ?? null}>{barreDOnglets}</TitleBar>

      <div className="relative flex min-h-0 flex-1">
        {vault.etat?.dossier != null && barreVisible && (
          <Sidebar
            vault={vaultAffiche}
            memosMasques={memosMasques}
            surMasquageDesMemos={(masquer) => void api.masquerMemos({ masquer }).then(memos.definir)}
            selection={reglagesOuverts || corbeilleOuverte || historiqueIaOuvert ? null : selection}
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
            surCorbeille={mettreALaCorbeille}
            largeur={largeurDeBarre}
            surLargeur={definirLargeurDeBarre}
            surMasquage={() => definirBarreVisible(false)}
            surRecherche={ouvrirLaRecherche}
            reglagesOuverts={reglagesOuverts}
            surReglages={() => {
              definirReglagesOuverts((ouverts) => !ouverts);
              definirThemeOuvert(false);
              definirCorbeilleOuverte(false);
              definirHistoriqueIaOuvert(false);
            }}
            corbeilleOuverte={corbeilleOuverte}
            surCorbeilleOuverte={() => {
              definirCorbeilleOuverte((ouverte) => !ouverte);
              definirReglagesOuverts(false);
              definirThemeOuvert(false);
              definirHistoriqueIaOuvert(false);
            }}
          />
        )}

        {vault.etat?.dossier != null && !barreVisible && (
          // Panneau des pages fermé : de quoi le rouvrir, à sa place.
          <button
            type="button"
            onClick={() => definirBarreVisible(true)}
            title="Ouvrir le panneau des pages"
            aria-label="Ouvrir le panneau des pages"
            className="text-discret hover:bg-texte/10 hover:text-texte focus-visible:bg-texte/20 focus-visible:text-texte absolute top-1.5 left-2 z-20 flex size-7 items-center justify-center rounded outline-0"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        )}

        {/* Marge gauche plus large que la droite : les poignées des blocs y tiennent sans toucher le panneau latéral. */}
        <main className="min-w-0 flex-1 overflow-y-auto pr-6 pb-4 pl-12">
          {vault.etat === null ? null : sansVault ? (
            <VaultChooser vault={vault} dossierPropose={vault.etat.dossierPropose} />
          ) : historiqueIaOuvert ? (
            <AiUsageScreen />
          ) : corbeilleOuverte ? (
            <TrashScreen
              surRestauration={(arbre) => vault.definirArbre(arbre)}
              surOuverture={(id) => {
                const page = trouverParCle(vault.arbre, id);
                if (page !== null) {
                  selectionner(cleDeNoeud(page));
                }
              }}
            />
          ) : reglagesOuverts ? (
            themeOuvert ? (
              <div className="mx-auto max-w-5xl py-4">
                <ThemePanel theme={theme} surRetour={() => definirThemeOuvert(false)} />
              </div>
            ) : (
              <SettingsScreen
                rubriques={[
                  { id: 'apparence', libelle: 'Apparence', contenu: <ThemeSummary theme={theme} surOuverture={() => definirThemeOuvert(true)} /> },
                  { id: 'nas', libelle: 'NAS', contenu: <NasConnectionPanel /> },
                  { id: 'correction', libelle: 'Correction', contenu: <SpellcheckPanel /> },
                  { id: 'ia', libelle: 'Fonctions IA', contenu: <AiPanel surHistorique={ouvrirHistoriqueIa} /> },
                  {
                    id: 'images',
                    libelle: 'Images et fichiers',
                    contenu: (
                      <>
                        <WebpConversion />
                        <UnusedFiles />
                      </>
                    ),
                  },
                  {
                    id: 'mentions',
                    libelle: 'Mentions',
                    contenu: (
                      <BrokenMentions
                        surOuverture={(chemin) => {
                          const page = trouverNoeud(vault.arbre, chemin);
                          if (page !== null) {
                            selectionner(cleDeNoeud(page));
                          }
                        }}
                      />
                    ),
                  },
                  { id: 'notion', libelle: 'Import Notion', contenu: <NotionImportPanel surImport={(arbre) => vault.definirArbre(arbre)} /> },
                ]}
              />
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
            <PageErrorBoundary key={noeudSelectionne.id} surReouverture={() => definirRechargements((nombre) => nombre + 1)}>
              <PageEditor
                key={`${noeudSelectionne.id}:${rechargements}`}
                noeud={noeudSelectionne}
                surRenommage={(titre) =>
                  renommerEnSuivantLesMentions(noeudSelectionne.chemin, titre).then((resultat) => {
                    if (!resultat.ok) {
                      return resultat.erreur.message;
                    }
                    void vault.recharger();
                    return null;
                  })
                }
                surSousPage={() => void creer(noeudSelectionne)}
                entrer={aEcrire === noeudSelectionne.id}
                surEntree={contenuRejoint}
                theme={theme.theme}
                surConflit={ouvrirConflit}
                // Sommaire latéral permanent (docs/spec/interface.md) : plus d'interrupteur depuis le retrait de Ctrl+Maj+\.
                sommaireVisible={true}
                surOuvrirPage={selectionner}
                surIcone={(x, y) => definirChoixDIcone({ chemin: noeudSelectionne.chemin, icone: noeudSelectionne.icone, x, y })}
                surExport={() => definirExportDe(noeudSelectionne.chemin)}
                surMode={(mode) => vault.changerMode(noeudSelectionne.chemin, mode)}
                memos={noeudSelectionne.role === 'memos' ? memos.etat : null}
                surMemos={memos.definir}
                surArbreModifie={() => void vault.recharger()}
                surCorbeille={mettreALaCorbeille}
              />
            </PageErrorBoundary>
          ) : noeudSelectionne === null ? (
            <PageSearch arbre={vault.arbre} recentes={recentes} ouvertures={ouvertures} surOuverture={(cle) => selectionner(cle)} surCreation={() => void creer(null)} />
          ) : (
            <PageSummary
              noeud={noeudSelectionne}
              surImport={(noeud) => {
                void vault.importer(noeud.chemin).then((page) => page !== null && selectionner(page.id));
              }}
            />
          )}
        </main>
      </div>
      <StatusBar surResolution={ouvrirConflit} />
      {rechercheOuverte && (
        <PageSearchDialog arbre={vault.arbre} recentes={recentes} ouvertures={ouvertures} surOuverture={(cle) => selectionner(cle, true)} surFermeture={() => definirRechercheOuverte(false)} />
      )}
      {noeudAExporter !== null && <ExportDialog noeud={noeudAExporter} theme={theme.theme} surFermeture={() => definirExportDe(null)} />}
      {choixDIcone !== null && (
        <IconPicker
          icone={choixDIcone.icone}
          x={choixDIcone.x}
          y={choixDIcone.y}
          surChoix={(choix) => vault.changerIcone(choixDIcone.chemin, choix.genre === 'image' ? { octets: choix.octets } : { icone: choix.icone })}
          surFermeture={fermerChoixDIcone}
        />
      )}
      {depot !== null && vault.etat?.dossier != null && (
        <MarkdownDropDialog
          noms={depot.noms}
          pageOuverte={!reglagesOuverts && noeudSelectionne?.importe === true ? noeudSelectionne.titre : null}
          ajoutPossible={depot.ajoutPossible && !reglagesOuverts}
          surCreation={async () => {
            const parent = !reglagesOuverts && noeudSelectionne?.importe === true ? noeudSelectionne.chemin : '';
            const resultat = await api.creerPagesDepuisMarkdown({ fichiers: depot.fichiers, parent });
            if (!resultat.ok) {
              return resultat.erreur.message;
            }
            await vault.recharger();
            definirDepot(null);
            const premiere = resultat.pages[0];
            if (premiere !== undefined) {
              selectionner(premiere.id, true);
            }
            return null;
          }}
          surAjout={async () => {
            if (noeudSelectionne === null) {
              return 'Aucune page n’est ouverte.';
            }
            const resultat = await api.markdownAAjouter({ fichiers: depot.fichiers, page: noeudSelectionne.chemin });
            if (!resultat.ok) {
              return resultat.erreur.message;
            }
            if (!ajouterALaPageOuverte(resultat.markdown)) {
              return 'La page ouverte ne peut pas recevoir ce texte (lecture seule ou mode liste).';
            }
            definirDepot(null);
            return null;
          }}
          surAnnulation={() => definirDepot(null)}
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
