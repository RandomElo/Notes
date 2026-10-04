import { classerParTitre, dossierParent, indexerTitres } from '@notes/core';
import type { TitleEntry, TreeNode } from '@notes/core';
import { FilePlus, FileText, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { emplacementsProposes, libelleDeCreation } from './creation-place';
import type { CreationPlace } from './creation-place';

/** Résultats montrés au plus : au-delà, mieux vaut préciser la saisie. */
const maxResultats = 50;
/** Pages récentes montrées quand rien n'est tapé. */
const maxRecentesMontrees = 8;

interface SearchPaletteProps {
  arbre: readonly TreeNode[];
  /** Clés des pages ouvertes récemment, la plus récente en premier. */
  recentes: readonly string[];
  /** Ouvre la page choisie, dans un nouvel onglet si demandé (Ctrl+Entrée). */
  surChoix: (id: string, nouvelOnglet: boolean) => void;
  /** Page ouverte dans la fenêtre : on propose de créer la nouvelle page juste après elle, ou dedans. */
  pageOuverte: TreeNode | null;
  /** Crée une page avec ce titre à cet emplacement. Rend le message d'erreur en cas d'échec, null sinon. */
  surCreation: (titre: string, ou: CreationPlace) => Promise<string | null>;
  surFermeture: () => void;
  /** Vrai dans la petite fenêtre du raccourci global : la recherche occupe toute la fenêtre, sans fond assombri. */
  seule?: boolean;
}

type Option = { genre: 'page'; entree: TitleEntry; positions: number[] } | { genre: 'creation'; titre: string; ou: CreationPlace };

/**
 * Recherche `Ctrl+K` (README §7) : sur les titres seulement, floue,
 * insensible aux accents. Sans saisie, les pages récentes. Sans résultat,
 * propose de créer la page : après la page ouverte, dedans, ou à la racine.
 */
export function SearchPalette({ arbre, recentes, pageOuverte, surChoix, surCreation, surFermeture, seule = false }: SearchPaletteProps) {
  const [saisie, definirSaisie] = useState('');
  const [rang, definirRang] = useState(0);
  const [erreur, definirErreur] = useState<string | null>(null);
  const [creation, definirCreation] = useState(false);
  const liste = useRef<HTMLDivElement>(null);
  // Dernière position connue de la souris : une ligne qui passe sous une souris immobile (fenêtre qui
  // s'ouvre ou s'agrandit dessous) ne doit pas prendre la main sur le choix au clavier.
  const souris = useRef<{ x: number; y: number } | null>(null);
  const surMouvement = (evenement: { screenX: number; screenY: number }, index: number): void => {
    const avant = souris.current;
    souris.current = { x: evenement.screenX, y: evenement.screenY };
    if (avant !== null && (avant.x !== evenement.screenX || avant.y !== evenement.screenY) && index !== rangValide) {
      definirRang(index);
    }
  };
  const pages = useMemo(() => [...indexerTitres(arbre).values()], [arbre]);

  const options = useMemo<Option[]>(() => {
    if (saisie.trim() === '') {
      const parCle = new Map(pages.map((page) => [page.id, page]));
      const recentesExistantes = recentes.flatMap((cle) => parCle.get(cle) ?? []);
      // Sans historique, les premières pages de l'arborescence.
      const montrees = recentesExistantes.length > 0 ? recentesExistantes : pages;
      return montrees.slice(0, maxRecentesMontrees).map((entree) => ({ genre: 'page', entree, positions: [] }));
    }
    const trouvees = classerParTitre(saisie, pages, (page) => page.titre).slice(0, maxResultats);
    if (trouvees.length === 0) {
      // Un emplacement par ligne, le premier choisi d'office : flèches puis Entrée pour un autre, sans la souris.
      return emplacementsProposes(pageOuverte).map((ou) => ({ genre: 'creation', titre: saisie.trim(), ou }));
    }
    return trouvees.map(({ element, positions }) => ({ genre: 'page', entree: element, positions }));
  }, [saisie, pages, recentes, pageOuverte]);

  const rangValide = Math.min(rang, options.length - 1);

  useEffect(() => {
    liste.current?.querySelector(`[data-rang="${rangValide}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [rangValide]);

  const choisir = (option: Option | undefined, nouvelOnglet: boolean): void => {
    if (option === undefined || creation) {
      return;
    }
    if (option.genre === 'page') {
      surChoix(option.entree.id, nouvelOnglet);
      return;
    }
    definirCreation(true);
    void surCreation(option.titre, option.ou).then((message) => {
      definirCreation(false);
      definirErreur(message);
    });
  };

  const surTouche = (evenement: KeyboardEvent): void => {
    switch (evenement.key) {
      case 'ArrowDown':
        evenement.preventDefault();
        definirRang((rangValide + 1) % options.length);
        break;
      case 'ArrowUp':
        evenement.preventDefault();
        definirRang((rangValide - 1 + options.length) % options.length);
        break;
      case 'Enter':
        evenement.preventDefault();
        choisir(options[rangValide], evenement.ctrlKey);
        break;
      case 'Escape':
        evenement.preventDefault();
        surFermeture();
        break;
      default:
    }
  };

  const idOption = (index: number) => `recherche-option-${index}`;

  return (
    <div className={seule ? '' : 'fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[12vh]'} onMouseDown={seule ? undefined : surFermeture}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Rechercher une page"
        className={`bg-surface flex w-full flex-col overflow-hidden ${seule ? 'max-h-[520px]' : 'border-bordure max-h-[70vh] max-w-xl rounded-lg border shadow-2xl'}`}
        onMouseDown={(evenement) => evenement.stopPropagation()}
      >
        <div className="border-bordure flex items-center gap-2 border-b px-3">
          <Search className="text-discret size-4 shrink-0" aria-hidden="true" />
          <input
            autoFocus
            value={saisie}
            onChange={(evenement) => {
              definirSaisie(evenement.target.value);
              definirRang(0);
              definirErreur(null);
            }}
            onKeyDown={surTouche}
            placeholder="Rechercher une page"
            aria-label="Rechercher une page"
            role="combobox"
            aria-expanded="true"
            aria-controls="recherche-resultats"
            aria-activedescendant={options.length > 0 ? idOption(rangValide) : undefined}
            spellCheck={false}
            className="placeholder:text-discret h-11 min-w-0 flex-1 bg-transparent text-sm outline-0"
          />
        </div>

        <div ref={liste} id="recherche-resultats" role="listbox" aria-label="Pages" className="overflow-y-auto p-1.5">
          {saisie.trim() === '' && options.length > 0 && <p className="text-discret px-2 pt-1 pb-1.5 text-xs">{recentes.length > 0 ? 'Pages récentes' : 'Pages'}</p>}
          {options.length === 0 && <p className="text-discret px-2 py-3 text-sm">Aucune page pour l'instant.</p>}
          {options.map((option, index) => (
            <div
              key={option.genre === 'page' ? option.entree.id : `creation-${option.ou}`}
              id={idOption(index)}
              data-rang={index}
              role="option"
              aria-selected={index === rangValide}
              onMouseMove={(evenement) => surMouvement(evenement, index)}
              onClick={(evenement) => choisir(option, evenement.ctrlKey)}
              className={`flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm ${index === rangValide ? 'bg-accent/25' : ''}`}
            >
              {option.genre === 'page' ? (
                <>
                  <FileText className="text-discret size-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 truncate">
                    <TitreSouligne titre={option.entree.titre} positions={option.positions} />
                  </span>
                  <Emplacement chemin={option.entree.chemin} />
                </>
              ) : (
                <>
                  <FilePlus className="text-accent size-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 truncate">{creation && index === rangValide ? 'Création…' : libelleDeCreation(option.titre, option.ou, pageOuverte)}</span>
                </>
              )}
            </div>
          ))}
        </div>

        {erreur !== null && (
          <p role="alert" className="bg-erreur/10 m-1.5 mt-0 rounded-md p-2 text-sm">
            {erreur}
          </p>
        )}
        <p className="border-bordure text-discret border-t px-3 py-1.5 text-xs">Entrée pour ouvrir, Ctrl+Entrée dans un nouvel onglet, Échap pour fermer</p>
      </div>
    </div>
  );
}

/** Le titre, avec les lettres trouvées à la couleur d'accent. */
function TitreSouligne({ titre, positions }: { titre: string; positions: readonly number[] }) {
  if (positions.length === 0) {
    return <>{titre}</>;
  }
  const trouvees = new Set(positions);
  const morceaux: ReactNode[] = [];
  let courant = '';
  let courantTrouve = false;
  const pousser = (): void => {
    if (courant !== '') {
      morceaux.push(
        courantTrouve ? (
          <span key={morceaux.length} className="text-accent">
            {courant}
          </span>
        ) : (
          courant
        ),
      );
    }
  };
  [...titre].reduce((position, caractere) => {
    const trouve = trouvees.has(position);
    if (trouve !== courantTrouve) {
      pousser();
      courant = '';
      courantTrouve = trouve;
    }
    courant += caractere;
    return position + caractere.length;
  }, 0);
  pousser();
  return <>{morceaux}</>;
}

/** Où se trouve la page, pour distinguer deux pages de même titre. */
function Emplacement({ chemin }: { chemin: string }) {
  const parent = dossierParent(chemin);
  return parent === '' ? null : <span className="text-discret ml-auto max-w-[45%] shrink-0 truncate pl-2 text-xs">{parent.split('/').join(' / ')}</span>;
}
