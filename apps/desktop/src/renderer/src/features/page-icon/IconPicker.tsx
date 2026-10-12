import { Image as IconeImage, Search, Smile, Shapes, Trash2 } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { chercherEmojis } from '@notes/ui/emoji';
import { ImageIconEditor } from './ImageIconEditor';
import { chercherIcones } from './lucide-search';
import { composantLucide } from './PageIcon';

/** Ce que l'utilisateur choisit : une valeur de la clé `icon` (null pour retirer), ou une image recadrée. */
export type IconChoice = { genre: 'valeur'; icone: string | null } | { genre: 'image'; octets: Uint8Array };

type Onglet = 'emoji' | 'lucide' | 'image';

interface IconPickerProps {
  /** Icône actuelle de la page. */
  icone: string | null;
  /** Où ouvrir le choix : sous ce point, en restant dans la fenêtre. */
  x: number;
  y: number;
  /** Applique le choix. Rend le message d'erreur, ou null : le choix se ferme alors. */
  surChoix: (choix: IconChoice) => Promise<string | null>;
  surFermeture: () => void;
}

const colonnes = 9;
/** Icônes Lucide dessinées au plus : au-delà, mieux vaut préciser la recherche. */
const maxIcones = 360;

/**
 * Choix de l'icône d'une page (docs/spec/editeur.md) : emoji cherché en français, icône
 * Lucide cherchée par un mot français ou son nom anglais, ou image recadrée.
 * Au clavier : la recherche garde le focus, les flèches parcourent la grille,
 * Entrée choisit, Échap ferme.
 */
export function IconPicker({ icone, x, y, surChoix, surFermeture }: IconPickerProps) {
  const [onglet, definirOnglet] = useState<Onglet>(icone !== null && /^[a-z0-9-]+$/.test(icone) ? 'lucide' : 'emoji');
  const [requete, definirRequete] = useState('');
  const [rang, definirRang] = useState(0);
  const [erreur, definirErreur] = useState<string | null>(null);
  const [enCours, definirEnCours] = useState(false);
  const [position, definirPosition] = useState<{ gauche: number; haut: number } | null>(null);
  const boite = useRef<HTMLDivElement>(null);
  const recherche = useRef<HTMLInputElement>(null);
  const grille = useRef<HTMLDivElement>(null);

  const elements = useMemo<{ valeur: string; libelle: string }[]>(() => {
    if (onglet === 'emoji') {
      return chercherEmojis(requete).map((entree) => ({ valeur: entree.emoji, libelle: entree.libelle }));
    }
    if (onglet === 'lucide') {
      return chercherIcones(requete)
        .slice(0, maxIcones)
        .map((nom) => ({ valeur: nom, libelle: nom }));
    }
    return [];
  }, [onglet, requete]);
  const rangValide = Math.min(rang, Math.max(0, elements.length - 1));

  useEffect(() => definirRang(0), [onglet, requete]);

  useLayoutEffect(() => {
    const element = boite.current;
    if (element === null) {
      return;
    }
    const largeur = element.offsetWidth;
    const hauteur = element.offsetHeight;
    definirPosition({
      gauche: Math.max(8, Math.min(x, window.innerWidth - largeur - 8)),
      haut: y + hauteur > window.innerHeight - 8 ? Math.max(8, window.innerHeight - hauteur - 8) : y,
    });
  }, [x, y, onglet]);

  // Une fois placé : un élément encore caché (avant le calcul de sa position) ne peut pas prendre le focus.
  const place = position !== null;
  useEffect(() => {
    if (place && onglet !== 'image') {
      recherche.current?.focus();
    }
  }, [onglet, place]);

  useEffect(() => {
    const fermerSiDehors = (evenement: MouseEvent): void => {
      if (boite.current !== null && !boite.current.contains(evenement.target as Node)) {
        surFermeture();
      }
    };
    window.addEventListener('mousedown', fermerSiDehors);
    return () => window.removeEventListener('mousedown', fermerSiDehors);
  }, [surFermeture]);

  useLayoutEffect(() => {
    grille.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [rangValide, elements]);

  const appliquer = async (choix: IconChoice): Promise<void> => {
    definirEnCours(true);
    definirErreur(null);
    const message = await surChoix(choix);
    definirEnCours(false);
    if (message === null) {
      surFermeture();
    } else {
      definirErreur(message);
    }
  };

  const surTouche = (evenement: KeyboardEvent): void => {
    if (evenement.key === 'Escape') {
      evenement.preventDefault();
      evenement.stopPropagation();
      surFermeture();
      return;
    }
    if (onglet === 'image' || elements.length === 0) {
      return;
    }
    const deplacements: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: colonnes, ArrowUp: -colonnes };
    const pas = deplacements[evenement.key];
    if (pas !== undefined) {
      evenement.preventDefault();
      definirRang(Math.max(0, Math.min(elements.length - 1, rangValide + pas)));
    } else if (evenement.key === 'Enter') {
      evenement.preventDefault();
      const choisi = elements[rangValide];
      if (choisi !== undefined) {
        void appliquer({ genre: 'valeur', icone: choisi.valeur });
      }
    }
  };

  const ongletBouton = (cle: Onglet, libelle: string, Icone: typeof Smile) => (
    <button
      type="button"
      role="tab"
      aria-selected={onglet === cle}
      onClick={() => {
        definirOnglet(cle);
        definirRequete('');
      }}
      className={`flex h-7 items-center gap-1.5 rounded px-2 text-sm outline-0 ${onglet === cle ? 'bg-texte/15 text-texte' : 'text-discret hover:bg-texte/10 focus-visible:bg-texte/20'}`}
    >
      <Icone className="size-3.5" aria-hidden="true" />
      {libelle}
    </button>
  );

  return (
    <div
      ref={boite}
      role="dialog"
      aria-label="Icône de la page"
      onKeyDown={surTouche}
      style={{ left: position?.gauche ?? x, top: position?.haut ?? y, visibility: position === null ? 'hidden' : 'visible' }}
      className="border-bordure bg-surface fixed z-50 w-96 rounded-md border p-2 shadow-xl shadow-black/40"
    >
      <div className="flex items-center gap-1">
        <div role="tablist" aria-label="Nature de l'icône" className="flex gap-1">
          {ongletBouton('emoji', 'Emoji', Smile)}
          {ongletBouton('lucide', 'Icônes', Shapes)}
          {ongletBouton('image', 'Image', IconeImage)}
        </div>
        {icone !== null && (
          <button
            type="button"
            disabled={enCours}
            onClick={() => void appliquer({ genre: 'valeur', icone: null })}
            className="text-discret hover:bg-texte/10 focus-visible:bg-texte/20 ml-auto flex h-7 items-center gap-1.5 rounded px-2 text-sm outline-0"
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
            Retirer
          </button>
        )}
      </div>

      {onglet === 'image' ? (
        <ImageIconEditor enCours={enCours} surValidation={(octets) => void appliquer({ genre: 'image', octets })} surErreur={definirErreur} />
      ) : (
        <>
          <label className="bg-texte/10 focus-within:bg-texte/15 mt-2 flex h-8 items-center gap-2 rounded px-2">
            <Search className="text-discret size-4 shrink-0" aria-hidden="true" />
            <input
              ref={recherche}
              value={requete}
              onChange={(evenement) => definirRequete(evenement.target.value)}
              placeholder={onglet === 'emoji' ? 'Chercher un emoji' : 'Chercher une icône (maison, livre…)'}
              aria-label={onglet === 'emoji' ? 'Chercher un emoji' : 'Chercher une icône'}
              spellCheck={false}
              className="placeholder:text-discret min-w-0 flex-1 bg-transparent text-sm outline-0"
            />
          </label>
          <div ref={grille} role="listbox" aria-label={onglet === 'emoji' ? 'Emojis' : 'Icônes'} className="mt-2 grid max-h-72 grid-cols-9 gap-0.5 overflow-x-hidden overflow-y-auto">
            {elements.map((element, index) => {
              const Icone = onglet === 'lucide' ? composantLucide(element.valeur) : null;
              return (
                <button
                  key={element.valeur}
                  type="button"
                  role="option"
                  aria-selected={index === rangValide}
                  aria-label={element.libelle}
                  title={element.libelle}
                  tabIndex={-1}
                  disabled={enCours}
                  onMouseDown={(evenement) => evenement.preventDefault()}
                  onClick={() => void appliquer({ genre: 'valeur', icone: element.valeur })}
                  className={`flex h-9 w-full items-center justify-center rounded text-xl ${index === rangValide ? 'bg-accent/25' : 'hover:bg-texte/10'}`}
                >
                  {Icone === null ? element.valeur : <Icone className="size-5" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
          {elements.length === 0 && <p className="text-discret px-1 py-3 text-sm">Rien pour « {requete} ».</p>}
          {onglet === 'lucide' && elements.length === maxIcones && <p className="text-discret px-1 pt-2 text-xs">Précise la recherche pour voir les autres icônes.</p>}
        </>
      )}
      {erreur !== null && (
        <p role="alert" className="text-erreur px-1 pt-2 text-xs">
          {erreur}
        </p>
      )}
    </div>
  );
}
