import { Palette } from 'lucide-react';
import type { ThemeStatus } from './useTheme';

/**
 * Le thème dans la page des réglages : où il en est, et le bouton qui mène à
 * son écran de réglage. L'éditeur de thème a son propre écran, pour ne pas se
 * mélanger au reste des réglages.
 */
export function ThemeSummary({ theme, surOuverture }: { theme: ThemeStatus; surOuverture: () => void }) {
  const { fichier, avertissements } = theme;
  const etat =
    fichier?.erreur != null
      ? fichier.erreur
      : fichier?.texte == null
        ? 'Thème par défaut.'
        : avertissements.length === 0
          ? 'Thème personnalisé.'
          : avertissements.length === 1
            ? 'Thème personnalisé, avec un réglage ignoré.'
            : `Thème personnalisé, avec ${avertissements.length} réglages ignorés.`;
  return (
    <section aria-labelledby="titre-apparence" className="space-y-4">
      <div>
        <h2 id="titre-apparence" className="text-xl font-semibold">
          Apparence
        </h2>
        <p className="text-discret mt-1 text-sm">Couleurs, polices, titres et largeurs de l'application.</p>
      </div>
      <div className="bg-surface flex flex-wrap items-center justify-between gap-3 rounded-lg p-4 text-sm">
        <p role="status">{etat}</p>
        <button
          type="button"
          onClick={surOuverture}
          className="bg-accent/20 hover:bg-accent/35 focus-visible:bg-accent/45 inline-flex h-8 items-center justify-center gap-2 rounded-md px-3 leading-none font-medium whitespace-nowrap outline-0"
        >
          <Palette className="size-4 shrink-0" aria-hidden="true" />
          Modifier le thème
        </button>
      </div>
    </section>
  );
}
