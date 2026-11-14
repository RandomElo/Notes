import type { ReactNode } from 'react';
import { useStoredState } from '../../state/useStoredState';

/**
 * Réglages en rubriques (docs/spec/interface.md) : une colonne à gauche, une
 * rubrique affichée à la fois. La dernière rubrique ouverte est retrouvée.
 */

export interface SettingsSection {
  id: string;
  libelle: string;
  contenu: ReactNode;
}

export function SettingsScreen({ rubriques }: { rubriques: readonly SettingsSection[] }) {
  const estRubrique = (valeur: unknown): valeur is string => typeof valeur === 'string' && rubriques.some((rubrique) => rubrique.id === valeur);
  const [choisie, choisir] = useStoredState<string>('reglages.rubrique', rubriques[0]?.id ?? '', estRubrique);
  const ouverte = rubriques.find((rubrique) => rubrique.id === choisie) ?? rubriques[0];

  return (
    <div className="mx-auto flex max-w-4xl gap-10 py-4">
      <nav aria-label="Rubriques des réglages" className="sticky top-4 w-44 shrink-0 self-start">
        <ul className="space-y-1">
          {rubriques.map((rubrique) => (
            <li key={rubrique.id}>
              <button
                type="button"
                aria-current={rubrique.id === ouverte?.id ? 'page' : undefined}
                onClick={() => choisir(rubrique.id)}
                className={`w-full rounded-md px-3 py-1.5 text-left text-sm outline-0 focus-visible:bg-texte/20 focus-visible:text-texte ${
                  rubrique.id === ouverte?.id ? 'bg-accent/25 font-medium text-texte' : 'text-discret hover:bg-texte/10 hover:text-texte'
                }`}
              >
                {rubrique.libelle}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0 max-w-2xl flex-1 space-y-10">{ouverte?.contenu}</div>
    </div>
  );
}
