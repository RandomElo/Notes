import { ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

interface ExportSelectProps<T extends string> {
  /** Nom du champ, annoncé avec la valeur choisie. */
  libelle: string;
  valeur: T;
  choix: readonly { cle: T; libelle: string }[];
  surChoix: (cle: T) => void;
  /** Prend le focus à l'ouverture de la fenêtre. */
  autoFocus?: boolean;
  /** Largeur : toute la ligne, ou celle du texte. */
  pleineLargeur?: boolean;
}

/**
 * Liste de choix de la fenêtre d'export, dessinée comme le choix du type de bloc
 * de la barre d'outils (demande d'Eloi) plutôt que par le système : bouton avec
 * chevron, liste dessous, choix courant en bleu, survol et focus par le fond.
 * Flèches, Entrée, Échap ; Échap ferme la liste sans fermer la fenêtre.
 */
export function ExportSelect<T extends string>({ libelle, valeur, choix, surChoix, autoFocus = false, pleineLargeur = false }: ExportSelectProps<T>) {
  const [ouverte, definirOuverte] = useState(false);
  const actuel = Math.max(
    0,
    choix.findIndex((element) => element.cle === valeur),
  );
  const [actif, definirActif] = useState(actuel);
  const bouton = useRef<HTMLButtonElement>(null);
  const liste = useRef<HTMLDivElement>(null);
  const prefixe = useId();

  // Un clic ailleurs ferme la liste.
  useEffect(() => {
    if (!ouverte) {
      return;
    }
    const surClic = (evenement: MouseEvent): void => {
      const cible = evenement.target as Node;
      if (!liste.current?.contains(cible) && !bouton.current?.contains(cible)) {
        definirOuverte(false);
      }
    };
    document.addEventListener('mousedown', surClic);
    liste.current?.focus();
    return () => document.removeEventListener('mousedown', surClic);
  }, [ouverte]);

  const ouvrir = (): void => {
    definirActif(actuel);
    definirOuverte(true);
  };
  const fermer = (): void => {
    definirOuverte(false);
    bouton.current?.focus();
  };
  const choisir = (index: number): void => {
    const element = choix[index];
    fermer();
    if (element !== undefined && element.cle !== valeur) {
      surChoix(element.cle);
    }
  };

  const surToucheBouton = (evenement: KeyboardEvent<HTMLButtonElement>): void => {
    if (evenement.key === 'ArrowDown' || evenement.key === 'ArrowUp') {
      evenement.preventDefault();
      ouvrir();
    }
  };
  const surToucheListe = (evenement: KeyboardEvent<HTMLDivElement>): void => {
    if (evenement.key === 'ArrowDown' || evenement.key === 'ArrowUp') {
      evenement.preventDefault();
      definirActif((index) => (index + (evenement.key === 'ArrowDown' ? 1 : -1) + choix.length) % choix.length);
    } else if (evenement.key === 'Enter' || evenement.key === ' ') {
      evenement.preventDefault();
      choisir(actif);
    } else if (evenement.key === 'Escape') {
      // La fenêtre d'export écoute Échap sur window et ignore une touche déjà traitée.
      evenement.preventDefault();
      fermer();
    } else if (evenement.key === 'Tab') {
      definirOuverte(false);
    }
  };

  return (
    <div className={`relative ${pleineLargeur ? 'w-full' : ''}`}>
      <button
        ref={bouton}
        type="button"
        autoFocus={autoFocus}
        aria-haspopup="listbox"
        aria-expanded={ouverte}
        aria-label={`${libelle} : ${choix[actuel]?.libelle ?? ''}`}
        onClick={() => (ouverte ? fermer() : ouvrir())}
        onKeyDown={surToucheBouton}
        className={`flex h-9 items-center gap-1.5 rounded-md px-3 text-sm outline-0 ${pleineLargeur ? 'w-full' : ''} ${
          ouverte ? 'bg-accent/25' : 'bg-texte/10 hover:bg-texte/15 focus-visible:bg-texte/20'
        }`}
      >
        <span className="min-w-0 flex-1 truncate text-left">{choix[actuel]?.libelle}</span>
        <ChevronDown className="text-discret size-4 flex-none" aria-hidden="true" />
      </button>
      {ouverte && (
        <div
          ref={liste}
          role="listbox"
          tabIndex={-1}
          aria-label={libelle}
          aria-activedescendant={`${prefixe}-${actif}`}
          onKeyDown={surToucheListe}
          className={`border-bordure bg-surface absolute top-full left-0 z-30 mt-1 rounded-md border py-1 shadow-xl shadow-black/40 outline-0 ${pleineLargeur ? 'w-full' : 'min-w-full'}`}
        >
          {choix.map((element, index) => (
            <div
              key={element.cle}
              id={`${prefixe}-${index}`}
              role="option"
              aria-selected={element.cle === valeur}
              onMouseMove={() => definirActif(index)}
              onClick={() => choisir(index)}
              className={`cursor-pointer px-3 py-1 text-sm whitespace-nowrap ${index === actif ? (element.cle === valeur ? 'bg-accent/35' : 'bg-texte/10') : element.cle === valeur ? 'bg-accent/25' : ''}`}
            >
              {element.libelle}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
