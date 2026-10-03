import { dossierParent, titreParDefaut, trouverNoeud } from '@notes/core';
import type { TreeNode } from '@notes/core';
import { ArrowDownToLine, Copy, FilePlus, Pencil } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent, KeyboardEvent } from 'react';
import type { Vault } from '../../state/useVault';
import { ContextMenu } from './ContextMenu';
import type { MenuItem } from './ContextMenu';
import { TreeRow } from './TreeRow';
import { cibleDeDecalage, cibleDeDepot, cleDeNoeud, lignesVisibles, zoneDeDepot } from './tree-model';
import type { DropZone } from './tree-model';

export interface PageTreeProps {
  vault: Vault;
  selection: string | null;
  surSelection: (cle: string) => void;
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
}

interface Survol {
  chemin: string;
  zone: DropZone;
}

/** L'arborescence des pages : sélection, dépliage, clavier, glisser-déposer et menu contextuel. */
export function PageTree(props: PageTreeProps) {
  const { vault, selection, deplies, renommage } = props;
  const lignes = useMemo(() => lignesVisibles(vault.arbre, deplies), [vault.arbre, deplies]);
  const [focus, definirFocus] = useState<string | null>(null);
  const [aFocaliser, definirAFocaliser] = useState<string | null>(null);
  const [deplace, definirDeplace] = useState<string | null>(null);
  const [survol, definirSurvol] = useState<Survol | null>(null);
  const [menu, definirMenu] = useState<{ noeud: TreeNode; x: number; y: number } | null>(null);
  const elements = useRef(new Map<string, HTMLDivElement>());

  // La ligne qui porte le focus clavier : celle qu'on a visitée, sinon la sélection, sinon la première.
  const cles = lignes.map((ligne) => cleDeNoeud(ligne.noeud));
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

  const elementsDuMenu = (noeud: TreeNode): MenuItem[] => {
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
      {
        libelle: 'Dupliquer',
        icone: Copy,
        action: () => {
          void vault.dupliquerPage(noeud.chemin).then((page) => page !== null && props.surSelection(page.id));
        },
      },
    ];
  };

  const surTouche = (evenement: KeyboardEvent<HTMLDivElement>, noeud: TreeNode, rang: number) => {
    const cle = cleDeNoeud(noeud);
    const allerA = (cible: TreeNode | undefined) => {
      if (cible !== undefined) {
        elements.current.get(cleDeNoeud(cible))?.focus();
      }
    };
    const deplie = deplies.has(cle);

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
        props.surSelection(cle);
        break;
      case 'F2':
        if (noeud.importe) {
          props.surRenommage(cle);
        }
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
    if (deplace === null) {
      return;
    }
    const boite = evenement.currentTarget.getBoundingClientRect();
    const zone = zoneDeDepot((evenement.clientY - boite.top) / boite.height, noeud.importe);
    if (cibleDeDepot(vault.arbre, deplace, noeud.chemin, zone) === null) {
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
    const origine = deplace === null ? null : trouverNoeud(vault.arbre, deplace);
    const cible = deplace !== null && survol !== null ? cibleDeDepot(vault.arbre, deplace, noeud.chemin, survol.zone) : null;
    if (origine !== null && cible !== null) {
      if (survol?.zone === 'dedans') {
        props.surDepliage(cleDeNoeud(noeud), true);
      }
      void deplacer(origine, cible.parent, cible.index);
    }
    definirDeplace(null);
    definirSurvol(null);
  };

  // Dépôt dans l'espace vide sous l'arborescence : la page va à la fin de la racine.
  const surSurvolDuFond = (evenement: DragEvent<HTMLDivElement>) => {
    // Seulement le fond lui-même : une ligne qui refuse le dépôt ne doit pas le laisser passer par ici.
    if (deplace !== null && evenement.target === evenement.currentTarget) {
      evenement.preventDefault();
      definirSurvol(null);
    }
  };
  const surDepotSurLeFond = (evenement: DragEvent<HTMLDivElement>) => {
    evenement.preventDefault();
    const origine = deplace === null ? null : trouverNoeud(vault.arbre, deplace);
    if (origine !== null) {
      void deplacer(origine, '', vault.arbre.filter((noeud) => noeud.importe && noeud.chemin !== origine.chemin).length);
    }
    definirDeplace(null);
  };

  return (
    <div
      role="tree"
      aria-label="Pages"
      className="min-h-0 flex-1 overflow-y-auto px-2 pb-6"
      onDragOver={surSurvolDuFond}
      onDrop={surDepotSurLeFond}
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
            selectionne={selection === cle}
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
            surSelection={() => props.surSelection(cle)}
            surBascule={() => props.surDepliage(cle, !deplies.has(cle))}
            surFocus={() => definirFocus(cle)}
            surTouche={(evenement) => surTouche(evenement, noeud, rang)}
            surMenu={(x, y) => definirMenu({ noeud, x, y })}
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
              evenement.dataTransfer.effectAllowed = 'move';
              evenement.dataTransfer.setData('text/plain', noeud.titre);
              definirDeplace(noeud.chemin);
            }}
            surSurvol={(evenement) => surSurvol(evenement, noeud)}
            surDepot={(evenement) => surDepot(evenement, noeud)}
            surFinDeGlisser={() => {
              definirDeplace(null);
              definirSurvol(null);
            }}
          />
        );
      })}
      {menu !== null && (
        <ContextMenu x={menu.x} y={menu.y} elements={elementsDuMenu(menu.noeud)} surFermeture={() => definirMenu(null)} />
      )}
    </div>
  );
}
