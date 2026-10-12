import { dossierParent, titreParDefaut, trouverNoeud } from '@notes/core';
import type { TreeNode } from '@notes/core';
import { ArrowDownToLine, Copy, Eye, EyeOff, FilePlus, FolderOpen, Pencil, Smile, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent, KeyboardEvent } from 'react';
import { api } from '../../lib/ipc';
import type { Vault } from '../../state/useVault';
import { ContextMenu } from './ContextMenu';
import { DeleteConfirmation } from './DeleteConfirmation';
import type { MenuItem } from './ContextMenu';
import { TreeRow } from './TreeRow';
import { cibleDeDecalage, cibleDeDepot, cleDeNoeud, ligneApresSuppression, lignesVisibles, plageDeSelection, racinesDeSelection, zoneDeDepot } from './tree-model';
import type { DropZone } from './tree-model';

export interface PageTreeProps {
  vault: Vault;
  selection: string | null;
  /** Ouvre une page. « nouvelOnglet » : Ctrl+clic, clic du milieu ou Ctrl+Entrée. */
  surSelection: (cle: string, nouvelOnglet?: boolean) => void;
  deplies: ReadonlySet<string>;
  surDepliage: (cle: string, deplie: boolean) => void;
  renommage: string | null;
  surRenommage: (cle: string | null) => void;
  /** Crée une page sous ce parent (vide pour la racine) et la met en renommage. */
  surCreation: (parent: TreeNode | null) => void;
  /**
   * Échap sur le nom d'une page encore « Sans titre » : la supprime si elle est vide. Rend la clé
   * de la ligne à focaliser ensuite, null si la page reste.
   */
  surAbandon: (noeud: TreeNode) => Promise<string | null>;
  /** Ouvre le choix de l'icône de la page, à cet endroit de la fenêtre. */
  surIcone: (noeud: TreeNode, x: number, y: number) => void;
  /** Met ces pages à la corbeille (sans leurs sous-pages sélectionnées, qui partent avec elles). Vrai si c'est fait. */
  surCorbeille: (noeuds: TreeNode[]) => Promise<boolean>;
  /** Masque la page « Mémos vocaux » de l'arborescence sur ce poste, ou la réaffiche (docs/spec/memos.md). */
  surMasquageDesMemos: (masquer: boolean) => void;
  /** La page « Mémos vocaux » est masquée : le clic droit dans le vide propose de la réafficher. */
  memosMasques: boolean;
}

interface Survol {
  chemin: string;
  zone: DropZone;
}

/**
 * L'arborescence des pages : page ouverte, sélection multiple (`Maj+clic`,
 * `Maj+↑/↓`), dépliage, clavier, glisser-déposer et menu contextuel.
 */
export function PageTree(props: PageTreeProps) {
  const { vault, selection, deplies, renommage } = props;
  const lignes = useMemo(() => lignesVisibles(vault.arbre, deplies), [vault.arbre, deplies]);
  const [focus, definirFocus] = useState<string | null>(null);
  const [aFocaliser, definirAFocaliser] = useState<string | null>(null);
  // Pages glissées : une seule, ou toute la sélection quand on glisse une page sélectionnée.
  const [deplaces, definirDeplaces] = useState<string[] | null>(null);
  // Sélection multiple, par clés stables, et la ligne d'où elle part.
  const [choix, definirChoix] = useState<ReadonlySet<string>>(new Set());
  const [ancre, definirAncre] = useState<string | null>(null);
  const [survol, definirSurvol] = useState<Survol | null>(null);
  // Menu d'une ligne, ou du fond (noeud null) : réafficher la page « Mémos vocaux ».
  const [menu, definirMenu] = useState<{ noeud: TreeNode | null; x: number; y: number } | null>(null);
  // Pages avec sous-pages en attente de confirmation avant la corbeille.
  const [aConfirmer, definirAConfirmer] = useState<{ noeuds: TreeNode[]; x: number; y: number } | null>(null);
  const elements = useRef(new Map<string, HTMLDivElement>());

  // La ligne qui porte le focus clavier : celle qu'on a visitée, sinon la sélection, sinon la première.
  const cles = lignes.map((ligne) => cleDeNoeud(ligne.noeud));
  // Une page sortie de l'arbre (supprimée ailleurs) quitte la sélection ; une page repliée y reste.
  const choisis = useMemo(() => {
    const presentes = new Set<string>();
    const parcourir = (noeuds: readonly TreeNode[]) => {
      for (const noeud of noeuds) {
        presentes.add(cleDeNoeud(noeud));
        parcourir(noeud.enfants);
      }
    };
    parcourir(vault.arbre);
    return new Set([...choix].filter((cle) => presentes.has(cle)));
  }, [choix, vault.arbre]);
  const viderChoix = () => {
    if (choix.size > 0) {
      definirChoix(new Set());
    }
  };
  const cleFocalisable =
    (focus !== null && cles.includes(focus) ? focus : null) ??
    (selection !== null && cles.includes(selection) ? selection : null) ??
    cles[0] ??
    null;

  useEffect(() => {
    if (aFocaliser !== null && renommage === null) {
      elements.current.get(aFocaliser)?.focus();
      definirAFocaliser(null);
    }
  }, [aFocaliser, renommage, lignes]);

  const deplacer = useCallback(
    async (noeud: TreeNode, parent: string, index: number) => {
      const page = await vault.deplacerPage(noeud.chemin, parent, index);
      if (page !== null) {
        definirAFocaliser(page.id);
      }
    },
    [vault],
  );

  /**
   * Met des pages à la corbeille, sans confirmation sauf si l'une d'elles a des sous-pages (choix
   * d'Eloi). « point » : où afficher la confirmation, sous la première ligne par défaut.
   */
  const supprimer = (noeuds: TreeNode[], point?: { x: number; y: number }) => {
    const [premiere] = noeuds;
    if (premiere === undefined) {
      return;
    }
    if (noeuds.some((noeud) => noeud.enfants.length > 0)) {
      const ligneDOrigine = elements.current.get(cleDeNoeud(premiere))?.getBoundingClientRect();
      definirAConfirmer({ noeuds, x: point?.x ?? (ligneDOrigine?.left ?? 0) + 24, y: point?.y ?? ligneDOrigine?.bottom ?? 0 });
      return;
    }
    void mettreALaCorbeille(noeuds);
  };

  /** Met des pages à la corbeille, puis donne le focus à la ligne qui les suit. */
  const mettreALaCorbeille = async (noeuds: TreeNode[]) => {
    const suivante = ligneApresSuppression(lignes, noeuds);
    if (await props.surCorbeille(noeuds)) {
      definirChoix(new Set());
      definirAncre(null);
      if (suivante !== null) {
        definirAFocaliser(suivante);
      }
    }
  };

  /** Pages concernées par une action sur cette ligne : toute la sélection si elle en fait partie, sinon elle seule. */
  const pagesVisees = (noeud: TreeNode): TreeNode[] =>
    choisis.size > 1 && choisis.has(cleDeNoeud(noeud)) ? racinesDeSelection(lignes, choisis) : noeud.importe ? [noeud] : [];

  const elementsDuMenu = (noeud: TreeNode, x: number, y: number): MenuItem[] => {
    const visees = pagesVisees(noeud);
    if (visees.length > 1) {
      return [{ libelle: `Mettre les ${visees.length} pages à la corbeille`, icone: Trash2, raccourci: 'Suppr', action: () => supprimer(visees, { x, y }) }];
    }
    if (!noeud.importe) {
      return [
        {
          libelle: 'Importer dans Notes',
          icone: ArrowDownToLine,
          action: () => {
            void vault.importer(noeud.chemin).then((page) => page !== null && props.surSelection(page.id));
          },
        },
      ];
    }
    return [
      { libelle: 'Nouvelle sous-page', icone: FilePlus, action: () => props.surCreation(noeud) },
      { libelle: 'Renommer', icone: Pencil, raccourci: 'F2', action: () => props.surRenommage(cleDeNoeud(noeud)) },
      { libelle: 'Icône', icone: Smile, action: () => props.surIcone(noeud, x, y) },
      {
        libelle: 'Dupliquer',
        icone: Copy,
        action: () => {
          void vault.dupliquerPage(noeud.chemin).then((page) => page !== null && props.surSelection(page.id));
        },
      },
      ...(noeud.role === 'memos'
        ? [
            // Un fichier audio déposé dans ce dossier devient un mémo en attente (docs/spec/memos.md).
            { libelle: 'Ouvrir le dossier des mémos', icone: FolderOpen, action: () => void api.ouvrirDossierMemos() },
            { libelle: 'Masquer de l’arborescence', icone: EyeOff, action: () => props.surMasquageDesMemos(true) },
          ]
        : []),
      { libelle: 'Mettre à la corbeille', icone: Trash2, raccourci: 'Suppr', action: () => supprimer([noeud], { x, y }) },
    ];
  };

  /** Clic sur une ligne : `Maj` étend la sélection sans ouvrir de page, sinon la page s'ouvre et la sélection se défait. */
  const surClic = (noeud: TreeNode, nouvelOnglet: boolean, etendre: boolean) => {
    const cle = cleDeNoeud(noeud);
    if (etendre) {
      const depart = (choisis.size > 0 ? ancre : null) ?? (selection !== null && cles.includes(selection) ? selection : cle);
      definirAncre(depart);
      definirChoix(new Set(plageDeSelection(lignes, depart, cle)));
      return;
    }
    viderChoix();
    definirAncre(cle);
    props.surSelection(cle, nouvelOnglet);
  };

  const surTouche = (evenement: KeyboardEvent<HTMLDivElement>, noeud: TreeNode, rang: number) => {
    const cle = cleDeNoeud(noeud);
    const allerA = (cible: TreeNode | undefined) => {
      if (cible !== undefined) {
        // Se déplacer sans Maj défait la sélection : `Suppr` vise alors la ligne du focus.
        viderChoix();
        elements.current.get(cleDeNoeud(cible))?.focus();
      }
    };
    const deplie = deplies.has(cle);

    // Maj+↑/↓ : la sélection s'étend de la ligne de départ jusqu'à la ligne suivante ou précédente.
    if (evenement.shiftKey && !evenement.ctrlKey && !evenement.altKey && (evenement.key === 'ArrowUp' || evenement.key === 'ArrowDown')) {
      evenement.preventDefault();
      const cible = lignes[rang + (evenement.key === 'ArrowUp' ? -1 : 1)]?.noeud;
      if (cible !== undefined) {
        const depart = (choisis.size > 0 ? ancre : null) ?? cle;
        definirAncre(depart);
        definirChoix(new Set(plageDeSelection(lignes, depart, cleDeNoeud(cible))));
        elements.current.get(cleDeNoeud(cible))?.focus();
      }
      return;
    }

    if (evenement.altKey && (evenement.key === 'ArrowUp' || evenement.key === 'ArrowDown')) {
      evenement.preventDefault();
      const cible = noeud.importe ? cibleDeDecalage(vault.arbre, noeud.chemin, evenement.key === 'ArrowUp' ? -1 : 1) : null;
      if (cible !== null) {
        void deplacer(noeud, cible.parent, cible.index);
      }
      return;
    }

    switch (evenement.key) {
      case 'ArrowDown':
        allerA(lignes[rang + 1]?.noeud);
        break;
      case 'ArrowUp':
        allerA(lignes[rang - 1]?.noeud);
        break;
      case 'Home':
        allerA(lignes[0]?.noeud);
        break;
      case 'End':
        allerA(lignes.at(-1)?.noeud);
        break;
      case 'ArrowRight':
        if (noeud.enfants.length > 0 && !deplie) {
          props.surDepliage(cle, true);
        } else if (deplie) {
          allerA(noeud.enfants[0]);
        }
        break;
      case 'ArrowLeft':
        if (deplie) {
          props.surDepliage(cle, false);
        } else {
          allerA(lignes.find((ligne) => ligne.noeud.chemin === dossierParent(noeud.chemin))?.noeud);
        }
        break;
      case 'Enter':
      case ' ':
        props.surSelection(cle, evenement.ctrlKey);
        break;
      case 'F2':
        if (noeud.importe) {
          props.surRenommage(cle);
        }
        break;
      case 'Delete':
        supprimer(choisis.size > 0 ? racinesDeSelection(lignes, choisis) : pagesVisees(noeud));
        break;
      case 'Escape':
        if (choisis.size === 0) {
          return;
        }
        definirChoix(new Set());
        break;
      case 'ContextMenu': {
        const boite = evenement.currentTarget.getBoundingClientRect();
        definirMenu({ noeud, x: boite.left + 24, y: boite.bottom });
        break;
      }
      default:
        return;
    }
    evenement.preventDefault();
  };

  const surSurvol = (evenement: DragEvent<HTMLDivElement>, noeud: TreeNode) => {
    if (deplaces === null) {
      return;
    }
    const boite = evenement.currentTarget.getBoundingClientRect();
    const zone = zoneDeDepot((evenement.clientY - boite.top) / boite.height, noeud.importe);
    if (cibleDeDepot(vault.arbre, deplaces, noeud.chemin, zone) === null) {
      definirSurvol(null);
      return;
    }
    evenement.preventDefault();
    evenement.stopPropagation();
    evenement.dataTransfer.dropEffect = 'move';
    definirSurvol((precedent) =>
      precedent?.chemin === noeud.chemin && precedent.zone === zone ? precedent : { chemin: noeud.chemin, zone },
    );
  };

  const surDepot = (evenement: DragEvent<HTMLDivElement>, noeud: TreeNode) => {
    evenement.preventDefault();
    evenement.stopPropagation();
    const cible = deplaces !== null && survol !== null ? cibleDeDepot(vault.arbre, deplaces, noeud.chemin, survol.zone) : null;
    if (deplaces !== null && cible !== null) {
      if (survol?.zone === 'dedans') {
        props.surDepliage(cleDeNoeud(noeud), true);
      }
      void deposer(deplaces, cible.parent, cible.index);
    }
    definirDeplaces(null);
    definirSurvol(null);
  };

  // Dépôt dans l'espace vide sous l'arborescence : la page va à la fin de la racine.
  const surSurvolDuFond = (evenement: DragEvent<HTMLDivElement>) => {
    // Seulement le fond lui-même : une ligne qui refuse le dépôt ne doit pas le laisser passer par ici.
    if (deplaces !== null && evenement.target === evenement.currentTarget) {
      evenement.preventDefault();
      definirSurvol(null);
    }
  };
  const surDepotSurLeFond = (evenement: DragEvent<HTMLDivElement>) => {
    evenement.preventDefault();
    if (deplaces !== null) {
      void deposer(deplaces, '', vault.arbre.filter((noeud) => noeud.importe && !deplaces.includes(noeud.chemin)).length);
    }
    definirDeplaces(null);
  };

  /** Dépose une page, ou plusieurs ensemble dans leur ordre d'affichage. */
  const deposer = async (chemins: string[], parent: string, index: number) => {
    const [seule] = chemins;
    const origine = chemins.length === 1 && seule !== undefined ? trouverNoeud(vault.arbre, seule) : null;
    if (origine !== null) {
      await deplacer(origine, parent, index);
    } else if (chemins.length > 1) {
      await vault.deplacerPages(chemins, parent, index);
    }
  };

  return (
    <div
      role="tree"
      aria-label="Pages"
      className="min-h-0 flex-1 overflow-y-auto px-2 pb-6"
      onDragOver={surSurvolDuFond}
      onDrop={surDepotSurLeFond}
      onContextMenu={(evenement) => {
        // Seulement le fond : une ligne a son propre menu.
        if (evenement.target === evenement.currentTarget && props.memosMasques) {
          evenement.preventDefault();
          definirMenu({ noeud: null, x: evenement.clientX, y: evenement.clientY });
        }
      }}
    >
      {lignes.length === 0 && <p className="text-discret px-2 py-3 text-sm">Aucune page pour l'instant.</p>}
      {lignes.map(({ noeud, profondeur }, rang) => {
        const cle = cleDeNoeud(noeud);
        return (
          <TreeRow
            key={cle}
            noeud={noeud}
            profondeur={profondeur}
            deplie={deplies.has(cle)}
            // Tant qu'il y a une sélection multiple, elle seule a le fond bleu : `Suppr` vise ce qu'on voit.
            selectionne={choisis.size > 0 ? choisis.has(cle) : selection === cle}
            focalisable={cleFocalisable === cle}
            enRenommage={renommage === cle}
            zoneDeDepot={survol?.chemin === noeud.chemin ? survol.zone : null}
            enregistrer={(element) => {
              if (element === null) {
                elements.current.delete(cle);
              } else {
                elements.current.set(cle, element);
              }
            }}
            surSelection={(nouvelOnglet, etendre) => surClic(noeud, nouvelOnglet, etendre)}
            surBascule={() => props.surDepliage(cle, !deplies.has(cle))}
            surFocus={() => definirFocus(cle)}
            surTouche={(evenement) => surTouche(evenement, noeud, rang)}
            surMenu={(x, y) => {
              if (!choisis.has(cle)) {
                viderChoix();
              }
              definirMenu({ noeud, x, y });
            }}
            surAjoutDeSousPage={() => props.surCreation(noeud)}
            surAbandonDuRenommage={() => {
              // Avant la fin du renommage : une page abandonnée ne doit pas recevoir le curseur.
              if (noeud.importe && noeud.titre === titreParDefaut) {
                void props.surAbandon(noeud).then((suivante) => suivante !== null && definirAFocaliser(suivante));
              }
              props.surRenommage(null);
              definirAFocaliser(cle);
            }}
            surValidationDuTitre={(titre) => {
              props.surRenommage(null);
              definirAFocaliser(cle);
              if (titre.trim() !== '' && titre.trim() !== noeud.titre) {
                void vault.renommerPage(noeud.chemin, titre);
              }
            }}
            surDebutDeGlisser={(evenement) => {
              const visees = pagesVisees(noeud);
              if (visees.length <= 1) {
                viderChoix();
              }
              evenement.dataTransfer.effectAllowed = 'move';
              evenement.dataTransfer.setData('text/plain', visees.map((page) => page.titre).join('\n') || noeud.titre);
              definirDeplaces(visees.length > 0 ? visees.map((page) => page.chemin) : [noeud.chemin]);
            }}
            surSurvol={(evenement) => surSurvol(evenement, noeud)}
            surDepot={(evenement) => surDepot(evenement, noeud)}
            surFinDeGlisser={() => {
              definirDeplaces(null);
              definirSurvol(null);
            }}
          />
        );
      })}
      {aConfirmer !== null && (
        <DeleteConfirmation
          noeuds={aConfirmer.noeuds}
          x={aConfirmer.x}
          y={aConfirmer.y}
          surConfirmation={() => {
            definirAConfirmer(null);
            void mettreALaCorbeille(aConfirmer.noeuds);
          }}
          surAbandon={() => {
            const [premiere] = aConfirmer.noeuds;
            definirAConfirmer(null);
            if (premiere !== undefined) {
              definirAFocaliser(cleDeNoeud(premiere));
            }
          }}
        />
      )}
      {menu !== null && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          elements={menu.noeud === null ? [{ libelle: 'Réafficher « Mémos vocaux »', icone: Eye, action: () => props.surMasquageDesMemos(false) }] : elementsDuMenu(menu.noeud, menu.x, menu.y)}
          surFermeture={() => definirMenu(null)}
        />
      )}
    </div>
  );
}
