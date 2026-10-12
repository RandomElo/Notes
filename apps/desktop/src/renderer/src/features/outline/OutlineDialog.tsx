import { correspondanceFloue } from '@notes/core';
import type { OutlineEntry } from '@notes/document';
import { List, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { libelleDuTitre } from './useOutline';

interface OutlineDialogProps {
  /** Titre de la page, rappelé en tête de la fenêtre. */
  titre: string;
  entrees: readonly OutlineEntry[];
  courant: number;
  surChoix: (entree: OutlineEntry) => void;
  surFermeture: () => void;
}

/**
 * Sommaire complet de la page (docs/spec/interface.md) : tous les niveaux de titre en
 * arbre, avec un filtre insensible aux accents. Un titre trouvé garde ses
 * titres parents, en plus discret, pour savoir où il se trouve.
 */
export function OutlineDialog({ titre, entrees, courant, surChoix, surFermeture }: OutlineDialogProps) {
  const [saisie, definirSaisie] = useState('');
  const [rang, definirRang] = useState<number | null>(null);
  const liste = useRef<HTMLUListElement>(null);

  // Lignes montrées : rang dans la page, et vrai si le titre correspond à la saisie (faux pour un parent gardé pour le contexte).
  const lignes = useMemo(() => {
    if (saisie.trim() === '') {
      return entrees.map((entree, index) => ({ entree, index, trouve: true }));
    }
    const gardes = new Map<number, boolean>();
    entrees.forEach((entree, index) => {
      if (correspondanceFloue(saisie, entree.texte) === null) {
        return;
      }
      gardes.set(index, true);
      // Les parents : en remontant, chaque titre moins profond que le dernier gardé.
      let profondeur = entree.profondeur;
      for (let parent = index - 1; parent >= 0 && profondeur > 0; parent -= 1) {
        const candidat = entrees[parent] as OutlineEntry;
        if (candidat.profondeur < profondeur) {
          profondeur = candidat.profondeur;
          if (!gardes.has(parent)) {
            gardes.set(parent, false);
          }
        }
      }
    });
    return [...gardes.entries()].sort(([a], [b]) => a - b).map(([index, trouve]) => ({ entree: entrees[index] as OutlineEntry, index, trouve }));
  }, [saisie, entrees]);

  const choisissables = lignes.filter((ligne) => ligne.trouve);
  // Sans flèche ni saisie, le titre où en est la lecture est proposé ; sinon le premier trouvé.
  const actif = rang ?? (saisie.trim() === '' && courant >= 0 ? courant : (choisissables[0]?.index ?? -1));

  // À l'ouverture, le titre en cours au milieu de la liste ; ensuite, aux flèches, juste ce qu'il faut pour le voir.
  const ouverture = useRef(true);
  useEffect(() => {
    liste.current?.querySelector(`[data-index="${actif}"]`)?.scrollIntoView({ block: ouverture.current ? 'center' : 'nearest' });
    ouverture.current = false;
  }, [actif]);

  const deplacer = (sens: 1 | -1): void => {
    if (choisissables.length === 0) {
      return;
    }
    const position = choisissables.findIndex((ligne) => ligne.index === actif);
    const suivante = position < 0 ? 0 : (position + sens + choisissables.length) % choisissables.length;
    definirRang(choisissables[suivante]?.index ?? null);
  };

  const surTouche = (evenement: KeyboardEvent): void => {
    if (evenement.key === 'ArrowDown' || evenement.key === 'ArrowUp') {
      evenement.preventDefault();
      deplacer(evenement.key === 'ArrowDown' ? 1 : -1);
    } else if (evenement.key === 'Enter') {
      evenement.preventDefault();
      const entree = entrees[actif];
      if (entree !== undefined && choisissables.some((ligne) => ligne.index === actif)) {
        surChoix(entree);
      }
    } else if (evenement.key === 'Escape') {
      evenement.preventDefault();
      surFermeture();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[12vh]" onMouseDown={surFermeture}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Sommaire de la page"
        className="border-bordure bg-surface flex max-h-[70vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border shadow-2xl"
        onMouseDown={(evenement) => evenement.stopPropagation()}
      >
        <div className="flex items-baseline gap-2 px-3 pt-3 pb-1">
          <List className="text-accent size-4 shrink-0 self-center" aria-hidden="true" />
          <h2 className="shrink-0 text-sm font-semibold">Sommaire</h2>
          <p className="text-discret min-w-0 truncate text-xs">{titre}</p>
        </div>
        <div className="border-bordure flex items-center gap-2 border-b px-3">
          <Search className="text-discret size-4 shrink-0" aria-hidden="true" />
          <input
            autoFocus
            value={saisie}
            onChange={(evenement) => {
              definirSaisie(evenement.target.value);
              definirRang(null);
            }}
            onKeyDown={surTouche}
            placeholder="Chercher un titre de la page"
            aria-label="Chercher un titre de la page"
            role="combobox"
            aria-expanded="true"
            aria-controls="sommaire-titres"
            aria-activedescendant={actif >= 0 ? `sommaire-titre-${actif}` : undefined}
            spellCheck={false}
            className="placeholder:text-discret h-11 min-w-0 flex-1 bg-transparent text-sm outline-0"
          />
        </div>
        <ul ref={liste} id="sommaire-titres" role="listbox" aria-label="Titres" className="overflow-y-auto overscroll-contain p-1.5">
          {entrees.length === 0 && (
            <li className="text-discret flex items-center gap-2 px-2 py-3 text-sm">
              <List className="size-4" aria-hidden="true" />
              Cette page n'a pas encore de titre.
            </li>
          )}
          {entrees.length > 0 && lignes.length === 0 && <li className="text-discret px-2 py-3 text-sm">Aucun titre ne correspond.</li>}
          {lignes.map(({ entree, index, trouve }) => (
            <li
              key={entree.position}
              id={`sommaire-titre-${index}`}
              data-index={index}
              role="option"
              aria-selected={index === actif}
              aria-disabled={!trouve}
              onMouseMove={() => trouve && index !== actif && definirRang(index)}
              onClick={() => trouve && surChoix(entree)}
              style={{ paddingLeft: 8 + entree.profondeur * 16 }}
              className={`truncate rounded-md py-1.5 pr-2 text-sm ${trouve ? 'cursor-pointer' : 'text-discret'} ${index === actif ? 'bg-accent/25' : ''} ${
                index === courant && index !== actif ? 'text-accent' : ''
              }`}
            >
              {libelleDuTitre(entree)}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
