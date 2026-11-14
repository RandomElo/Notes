import { classerParTitre } from '@notes/core';
import type { TreeNode } from '@notes/core';
import { FilePlus, FileText, Search } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { PageIcon } from '../page-icon/PageIcon';
import { cleDeNoeud } from '../sidebar/tree-model';
import { suggestions } from './page-suggestions';
import type { OpenCounts } from './page-suggestions';

/** Pages proposées avant toute saisie, et pages trouvées au plus. */
const nombreDeSuggestions = 8;
const maxResultats = 30;

interface PageTrouvable {
  cle: string;
  titre: string;
  icone: string | null;
  chemin: string;
}

function pagesDe(arbre: readonly TreeNode[]): PageTrouvable[] {
  return arbre.flatMap((noeud) => [
    ...(noeud.importe ? [{ cle: cleDeNoeud(noeud), titre: noeud.titre, icone: noeud.icone, chemin: noeud.chemin }] : []),
    ...pagesDe(noeud.enfants),
  ]);
}

interface PageSearchProps {
  arbre: readonly TreeNode[];
  recentes: readonly string[];
  ouvertures: OpenCounts;
  surOuverture: (cle: string) => void;
  /** « Nouvelle page » sous la liste ; absent dans la fenêtre de recherche. */
  surCreation?: () => void;
  /** Dans la fenêtre de recherche : Échap la ferme. */
  surFermeture?: () => void;
}

/**
 * Recherche de pages (docs/spec/interface.md) : au centre de la fenêtre quand aucune page n'est
 * affichée (onglet vide, ou plus d'onglet), ou dans `PageSearchDialog`. Avant toute saisie, les
 * pages récentes et les plus ouvertes ; ensuite, recherche floue sur les titres, sans accents.
 */
export function PageSearch({ arbre, recentes, ouvertures, surOuverture, surCreation, surFermeture }: PageSearchProps) {
  const [requete, definirRequete] = useState('');
  const [choix, definirChoix] = useState(0);
  const liste = useRef<HTMLDivElement>(null);
  const champ = useRef<HTMLInputElement>(null);
  const pages = useMemo(() => pagesDe(arbre), [arbre]);

  // Seul un collage au clavier (Ctrl+V, Maj+Inser) remplit le champ. Sous Linux, le clic du milieu colle la
  // sélection dans le champ qui a le focus : fermer le dernier onglet d'un clic molette remplissait la recherche
  // qui apparaît à sa place.
  const collageAuClavier = useRef(false);
  useEffect(() => {
    const element = champ.current;
    const refuserCollage = (evenement: Event): void => {
      const collage = evenement.type === 'paste' || (evenement as InputEvent).inputType?.startsWith('insertFromPaste');
      if (collage && !collageAuClavier.current) {
        evenement.preventDefault();
      }
    };
    element?.addEventListener('beforeinput', refuserCollage);
    element?.addEventListener('paste', refuserCollage);
    return () => {
      element?.removeEventListener('beforeinput', refuserCollage);
      element?.removeEventListener('paste', refuserCollage);
    };
  }, []);

  const trouvees = useMemo(() => {
    if (requete.trim() !== '') {
      return classerParTitre(requete, pages, (page) => page.titre)
        .slice(0, maxResultats)
        .map((resultat) => resultat.element);
    }
    const parCle = new Map(pages.map((page) => [page.cle, page]));
    return suggestions(recentes, ouvertures, (cle) => parCle.has(cle), nombreDeSuggestions).flatMap((cle) => parCle.get(cle) ?? []);
  }, [requete, pages, recentes, ouvertures]);
  const rang = Math.min(choix, Math.max(0, trouvees.length - 1));

  useLayoutEffect(() => {
    liste.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [rang, requete]);

  return (
    <div className={`mx-auto flex w-full max-w-xl flex-col ${surFermeture === undefined ? 'pt-[16vh] pb-8' : ''}`}>
      <div className="bg-surface focus-within:bg-bordure/60 flex items-center gap-3 rounded-xl px-4 shadow-lg shadow-black/20">
        <Search className="text-discret size-5 shrink-0" aria-hidden="true" />
        <input
          ref={champ}
          autoFocus
          role="combobox"
          aria-expanded={trouvees.length > 0}
          aria-controls="recherche-de-pages"
          aria-label="Chercher une page"
          placeholder="Chercher une page"
          value={requete}
          onChange={(evenement) => {
            definirRequete(evenement.target.value);
            definirChoix(0);
          }}
          onKeyUp={() => {
            collageAuClavier.current = false;
          }}
          onBlur={() => {
            collageAuClavier.current = false;
          }}
          onKeyDown={(evenement) => {
            collageAuClavier.current = ((evenement.ctrlKey || evenement.metaKey) && evenement.key.toLowerCase() === 'v') || (evenement.shiftKey && evenement.key === 'Insert');
            if (evenement.key === 'ArrowDown' || evenement.key === 'ArrowUp') {
              evenement.preventDefault();
              if (trouvees.length > 0) {
                definirChoix((rang + (evenement.key === 'ArrowDown' ? 1 : -1) + trouvees.length) % trouvees.length);
              }
            } else if (evenement.key === 'Escape' && surFermeture !== undefined) {
              evenement.preventDefault();
              evenement.stopPropagation();
              surFermeture();
            } else if (evenement.key === 'Enter') {
              evenement.preventDefault();
              const page = trouvees[rang];
              if (page !== undefined) {
                surOuverture(page.cle);
              }
            }
          }}
          className="placeholder:text-discret min-w-0 flex-1 bg-transparent py-3.5 text-lg outline-0"
        />
      </div>

      <div ref={liste} id="recherche-de-pages" role="listbox" aria-label="Pages" className="mt-3 max-h-[50vh] overflow-y-auto">
        {requete.trim() === '' && trouvees.length > 0 && <p className="text-discret px-4 pt-1 pb-1.5 text-xs">Suggestions</p>}
        {requete.trim() !== '' && trouvees.length === 0 && <p className="text-discret px-4 py-2 text-sm">Aucune page pour « {requete} ».</p>}
        {trouvees.map((page, index) => (
          <button
            key={page.cle}
            type="button"
            role="option"
            aria-selected={index === rang}
            tabIndex={-1}
            onMouseDown={(evenement) => evenement.preventDefault()}
            onMouseEnter={() => definirChoix(index)}
            onClick={() => surOuverture(page.cle)}
            className={`flex w-full items-center gap-3 rounded-lg px-4 py-2 text-left ${index === rang ? 'bg-accent/25' : ''}`}
          >
            <PageIcon icone={page.icone} chemin={page.chemin} className="text-discret size-4 text-base" defaut={<FileText className="text-discret size-4 shrink-0" aria-hidden="true" />} />
            <span className="min-w-0 truncate">{page.titre}</span>
            {page.chemin.includes('/') && <span className="text-discret ml-auto min-w-0 shrink truncate pl-2 text-xs">{page.chemin.split('/').slice(0, -1).join(' / ')}</span>}
          </button>
        ))}
      </div>

      {surCreation !== undefined && (
        <button
          type="button"
          onClick={surCreation}
          className="text-discret hover:bg-texte/10 hover:text-texte focus-visible:bg-texte/20 focus-visible:text-texte mt-4 inline-flex items-center gap-2 self-center rounded-md px-3 py-2 text-sm outline-0"
        >
          <FilePlus className="size-4" aria-hidden="true" />
          Nouvelle page
        </button>
      )}
    </div>
  );
}
