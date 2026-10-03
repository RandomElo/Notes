import { Plus, Settings, X } from 'lucide-react';
import { PageTree } from './PageTree';
import type { PageTreeProps } from './PageTree';

interface SidebarProps extends PageTreeProps {
  reglagesOuverts: boolean;
  surReglages: () => void;
}

/** Barre latérale : création de page, arborescence, erreurs des actions, accès aux réglages. */
export function Sidebar({ reglagesOuverts, surReglages, ...arbre }: SidebarProps) {
  const { vault } = arbre;
  return (
    <nav aria-label="Arborescence des pages" className="border-bordure bg-surface flex w-(--ui-largeur-barre) shrink-0 flex-col border-r">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h2 className="text-discret text-xs font-semibold tracking-wide uppercase">Pages</h2>
        <button
          type="button"
          onClick={() => arbre.surCreation(null)}
          title="Nouvelle page à la racine (Ctrl+Maj+N)"
          aria-label="Nouvelle page"
          className="text-discret hover:bg-bordure hover:text-texte focus-visible:bg-texte/20 focus-visible:text-texte flex size-6 items-center justify-center rounded outline-0"
        >
          <Plus className="size-4" aria-hidden="true" />
        </button>
      </div>

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

      <div className="border-bordure border-t p-2">
        <button
          type="button"
          onClick={surReglages}
          aria-pressed={reglagesOuverts}
          // Fond seul pour le focus clavier : après Échap, le focus revient sur ce bouton.
          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-0 ${
            reglagesOuverts
              ? 'bg-accent/25 focus-visible:bg-accent/40'
              : 'text-discret hover:bg-texte/10 hover:text-texte focus-visible:bg-texte/20 focus-visible:text-texte'
          }`}
        >
          <Settings className="size-4" aria-hidden="true" />
          Réglages
        </button>
      </div>
    </nav>
  );
}
