import { listerLangages } from '@notes/ui';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { filtrerLangages } from './language-search';

interface LanguagePickerProps {
  /** Langage actuel du bloc, null pour du texte brut. */
  actuel: string | null;
  surChoix: (langage: string | null) => void;
  surFermeture: () => void;
}

/** Nombre de langages affichés à la fois : la liste complète en compte près de deux cents. */
const affichesAuPlus = 60;

/**
 * Liste des langages d'un bloc de code, avec recherche (README §6). La
 * recherche ignore accents et casse et trouve aussi les alias (`ts`, `yml`).
 * Flèches pour choisir, Entrée pour valider, Échap pour fermer.
 */
export function LanguagePicker({ actuel, surChoix, surFermeture }: LanguagePickerProps) {
  const [requete, definirRequete] = useState('');
  const [rang, definirRang] = useState(0);
  const liste = useRef<HTMLDivElement>(null);
  const trouves = useMemo(() => {
    const langages = filtrerLangages(listerLangages(), requete).slice(0, affichesAuPlus);
    // « Texte brut » retire le langage : en tête sans recherche, ou si on le cherche.
    const brut = requete === '' || 'texte brut plain text'.includes(requete.toLowerCase());
    return [...(brut ? [{ id: null, nom: 'Texte brut' }] : []), ...langages.map((langage) => ({ id: langage.id as string | null, nom: langage.nom }))];
  }, [requete]);
  const choisi = Math.min(rang, Math.max(0, trouves.length - 1));

  useLayoutEffect(() => {
    liste.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [choisi, requete]);

  const surTouche = (evenement: KeyboardEvent<HTMLInputElement>): void => {
    if (evenement.key === 'ArrowDown' || evenement.key === 'ArrowUp') {
      evenement.preventDefault();
      const pas = evenement.key === 'ArrowDown' ? 1 : -1;
      definirRang((choisi + pas + trouves.length) % Math.max(1, trouves.length));
    } else if (evenement.key === 'Enter') {
      evenement.preventDefault();
      const langage = trouves[choisi];
      if (langage !== undefined) {
        surChoix(langage.id);
      }
    } else if (evenement.key === 'Escape') {
      evenement.preventDefault();
      surFermeture();
    }
  };

  return (
    <div className="border-bordure bg-surface absolute top-full left-0 z-30 mt-1 w-60 rounded-md border shadow-xl shadow-black/40" contentEditable={false}>
      <input
        autoFocus
        value={requete}
        onChange={(evenement) => {
          definirRequete(evenement.target.value);
          definirRang(0);
        }}
        onKeyDown={surTouche}
        onBlur={surFermeture}
        placeholder="Chercher un langage"
        aria-label="Chercher un langage"
        role="combobox"
        aria-expanded="true"
        aria-controls="langages-du-bloc"
        className="bg-texte/5 focus:bg-texte/10 w-full rounded-t-md px-3 py-2 font-sans text-sm outline-0"
      />
      <div ref={liste} id="langages-du-bloc" role="listbox" aria-label="Langages" className="max-h-64 overflow-y-auto py-1">
        {trouves.length === 0 && <p className="text-discret px-3 py-2 font-sans text-sm">Aucun langage pour « {requete} ».</p>}
        {trouves.map((langage, index) => (
          <button
            key={langage.id ?? ''}
            type="button"
            role="option"
            aria-selected={index === choisi}
            // Le clic ne doit pas faire perdre le focus au champ avant d'être pris en compte.
            onMouseDown={(evenement) => evenement.preventDefault()}
            onMouseEnter={() => definirRang(index)}
            onClick={() => surChoix(langage.id)}
            className={`block w-full px-3 py-1 text-left font-sans text-sm ${index === choisi ? 'bg-accent/25' : ''} ${langage.id === actuel ? 'text-accent' : ''}`}
          >
            {langage.nom}
          </button>
        ))}
      </div>
    </div>
  );
}
