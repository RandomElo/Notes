import { ChevronLeft, Plus, Search, Settings, Trash2, X } from 'lucide-react';
import { useRef } from 'react';
import type { PointerEvent } from 'react';
import { PageTree } from './PageTree';
import type { PageTreeProps } from './PageTree';

interface SidebarProps extends PageTreeProps {
  reglagesOuverts: boolean;
  surReglages: () => void;
  corbeilleOuverte: boolean;
  surCorbeilleOuverte: () => void;
  /** Largeur choisie à la souris, en pixels ; null : celle du thème. */
  largeur: number | null;
  surLargeur: (largeur: number | null) => void;
  /** Ferme le panneau (le bouton laissé à sa place le rouvre). */
  surMasquage: () => void;
  /** Ouvre la barre de recherche du poste sur les pages de Notes. */
  surRecherche: () => void;
}

/** Bornes de la largeur du panneau, glissé par son bord droit. */
export const largeurMinDuPanneau = 180;
export const largeurMaxDuPanneau = 520;

/**
 * Barre latérale : création de page, arborescence, erreurs des actions, accès à la corbeille et aux
 * réglages. Elle se ferme par son bouton et se règle en largeur en tirant son bord droit ;
 * un double-clic sur ce bord rend la largeur du thème.
 */
export function Sidebar({ reglagesOuverts, surReglages, corbeilleOuverte, surCorbeilleOuverte, largeur, surLargeur, surMasquage, surRecherche, ...arbre }: SidebarProps) {
  const { vault } = arbre;
  const panneau = useRef<HTMLElement>(null);
  const glisse = useRef<{ depart: number; largeur: number } | null>(null);

  const commencer = (evenement: PointerEvent<HTMLDivElement>): void => {
    evenement.preventDefault();
    evenement.currentTarget.setPointerCapture(evenement.pointerId);
    glisse.current = { depart: evenement.clientX, largeur: panneau.current?.getBoundingClientRect().width ?? largeurMinDuPanneau };
  };
  const suivre = (evenement: PointerEvent<HTMLDivElement>): void => {
    if (glisse.current !== null) {
      const voulue = glisse.current.largeur + evenement.clientX - glisse.current.depart;
      surLargeur(Math.round(Math.min(largeurMaxDuPanneau, Math.max(largeurMinDuPanneau, voulue))));
    }
  };

  return (
    <nav
      ref={panneau}
      aria-label="Arborescence des pages"
      style={largeur === null ? undefined : { width: largeur }}
      className="border-bordure bg-surface relative flex w-(--ui-largeur-barre) shrink-0 flex-col border-r"
    >
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h2 className="text-discret text-xs font-semibold tracking-wide uppercase">Pages</h2>
        {/* Les trois glyphes de Lucide n'occupent pas la même part de leur carré : leur taille est réglée pour qu'ils aient la même hauteur à l'écran. */}
          <span className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={surRecherche}
            title="Chercher une page (Ctrl+Maj+F)"
            aria-label="Chercher une page"
            className="text-discret hover:bg-bordure hover:text-texte focus-visible:bg-texte/20 focus-visible:text-texte flex size-8 items-center justify-center rounded outline-0"
          >
            <Search className="size-[19px]" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={surMasquage}
            title="Fermer le panneau des pages"
            aria-label="Fermer le panneau des pages"
            className="text-discret hover:bg-bordure hover:text-texte focus-visible:bg-texte/20 focus-visible:text-texte flex size-8 items-center justify-center rounded outline-0"
          >
            <ChevronLeft className="size-[26px]" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => arbre.surCreation(null)}
            title="Nouvelle page à la racine (Ctrl+Maj+N)"
            aria-label="Nouvelle page"
            className="text-discret hover:bg-bordure hover:text-texte focus-visible:bg-texte/20 focus-visible:text-texte flex size-8 items-center justify-center rounded outline-0"
          >
            <Plus className="size-[22px]" aria-hidden="true" />
          </button>
        </span>
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Largeur du panneau des pages"
        title="Tirer pour régler la largeur, double-clic pour revenir à la largeur du thème"
        onPointerDown={commencer}
        onPointerMove={suivre}
        onPointerUp={() => (glisse.current = null)}
        onPointerCancel={() => (glisse.current = null)}
        onDoubleClick={() => surLargeur(null)}
        className="hover:bg-accent/40 active:bg-accent/60 absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize touch-none"
      />

      <PageTree {...arbre} />

      {/* Le retour d'une action s'affiche ici, à côté de l'arborescence où elle a été faite. */}
      <div aria-live="polite">
        {vault.erreur !== null && (
          <div className="border-erreur/40 bg-erreur/10 mx-2 mb-2 flex items-start gap-2 rounded-md border p-2 text-sm">
            <p className="flex-1">{vault.erreur}</p>
            <button
              type="button"
              onClick={vault.fermerErreur}
              aria-label="Fermer le message"
              className="text-discret hover:text-texte focus-visible:bg-texte/20 focus-visible:text-texte shrink-0 rounded outline-0"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      <div className="border-bordure space-y-0.5 border-t p-2">
        <BottomButton libelle="Corbeille" icone={Trash2} actif={corbeilleOuverte} surClic={surCorbeilleOuverte} />
        <BottomButton libelle="Réglages" icone={Settings} actif={reglagesOuverts} surClic={surReglages} />
      </div>
    </nav>
  );
}

/** Bouton du bas de la barre latérale, qui ouvre un écran à la place de la page. */
function BottomButton(props: { libelle: string; icone: typeof Settings; actif: boolean; surClic: () => void }) {
  return (
    <button
      type="button"
      onClick={props.surClic}
      aria-pressed={props.actif}
      // Fond seul pour le focus clavier : après Échap, le focus revient sur ce bouton.
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-0 ${
        props.actif ? 'bg-accent/25 focus-visible:bg-accent/40' : 'text-discret hover:bg-texte/10 hover:text-texte focus-visible:bg-texte/20 focus-visible:text-texte'
      }`}
    >
      <props.icone className="size-4" aria-hidden="true" />
      {props.libelle}
    </button>
  );
}
