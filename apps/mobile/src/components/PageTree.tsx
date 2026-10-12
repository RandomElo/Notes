import type { TreeNode } from '@notes/core';
import { ChevronRight, CloudUpload, Plus } from 'lucide-react';
import { estEnAttente } from '../state/pending-pages';
import { PageIcon } from './PageIcon';

/**
 * Arborescence des pages (README §15), sur l'écran d'accueil : on déplie, on
 * ouvre, rien ne se déplace. Le « + » d'une page en crée une dessous.
 */
export function PageTree({
  arbre,
  deplies,
  basculer,
  ouvrirPage,
  adresse,
  nouvellePage,
}: {
  arbre: readonly TreeNode[];
  deplies: ReadonlySet<string>;
  basculer: (chemin: string) => void;
  ouvrirPage: (chemin: string) => void;
  adresse: (chemin: string) => string | null;
  nouvellePage: (parent: string, titre: string) => void;
}) {
  return <Branche noeuds={arbre} niveau={0} {...{ deplies, basculer, ouvrirPage, adresse, nouvellePage }} />;
}

function Branche({
  noeuds,
  niveau,
  deplies,
  basculer,
  ouvrirPage,
  adresse,
  nouvellePage,
}: {
  deplies: ReadonlySet<string>;
  basculer: (chemin: string) => void;
  ouvrirPage: (chemin: string) => void;
  noeuds: readonly TreeNode[];
  niveau: number;
  adresse: (chemin: string) => string | null;
  nouvellePage: (parent: string, titre: string) => void;
}) {
  return (
    <ul>
      {noeuds.map((noeud) => {
        const deplie = deplies.has(noeud.chemin);
        const lisible = noeud.genre !== 'dossier';
        return (
          <li key={noeud.chemin}>
            <div className="flex items-center rounded-lg" style={{ paddingLeft: niveau * 16 }}>
              {noeud.enfants.length > 0 ? (
                <button
                  type="button"
                  aria-label={deplie ? 'Replier' : 'Déplier'}
                  onClick={() => basculer(noeud.chemin)}
                  className="flex size-10 shrink-0 items-center justify-center rounded-full text-discret outline-none active:bg-texte/15"
                >
                  <ChevronRight className={`size-4 transition-transform ${deplie ? 'rotate-90' : ''}`} />
                </button>
              ) : (
                <span className="size-10 shrink-0" />
              )}
              <button
                type="button"
                onClick={() => (lisible ? ouvrirPage(noeud.chemin) : basculer(noeud.chemin))}
                className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg py-2.5 pr-3 text-left outline-none active:bg-texte/10 ${lisible ? '' : 'text-discret'}`}
              >
                <PageIcon icone={noeud.icone} chemin={noeud.chemin} liste={noeud.mode === 'todo'} adresse={adresse} className="text-lg" />
                <span className="truncate">{noeud.titre}</span>
                {estEnAttente(noeud.chemin) && <CloudUpload className="size-4 shrink-0 text-discret" aria-label="En attente du NAS" />}
              </button>
              {noeud.genre === 'page' && !estEnAttente(noeud.chemin) && (
                <button
                  type="button"
                  aria-label={`Nouvelle page dans « ${noeud.titre} »`}
                  onClick={() => nouvellePage(noeud.chemin, noeud.titre)}
                  className="flex size-10 shrink-0 items-center justify-center rounded-full text-discret outline-none active:bg-texte/15"
                >
                  <Plus className="size-4" />
                </button>
              )}
            </div>
            {deplie && noeud.enfants.length > 0 && <Branche noeuds={noeud.enfants} niveau={niveau + 1} {...{ deplies, basculer, ouvrirPage, adresse, nouvellePage }} />}
          </li>
        );
      })}
    </ul>
  );
}
