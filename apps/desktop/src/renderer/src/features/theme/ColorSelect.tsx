import { nomsDeCouleur } from '@notes/ui';
import type { ColorName } from '@notes/ui';
import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { libellesDeCouleur, surSixChiffres } from './theme-form-model';

interface ColorSelectProps {
  /** Pour l'étiquette du champ. */
  id: string;
  libelle: string;
  /** Un nom de la palette, ou une couleur `#rrggbb` propre au réglage. */
  valeur: string;
  palette: Record<ColorName, string>;
  /** Un nom de la palette, ou la couleur affichée quand on passe à « Couleur choisie ». */
  surChoix: (valeur: string) => void;
}

/** Pastille ronde d'une couleur. Un liseré clair la garde visible quand elle est proche du fond. */
export function Pastille({ couleur }: { couleur: string }) {
  return <span aria-hidden="true" className="size-3.5 flex-none rounded-full shadow-[inset_0_0_0_1px_rgb(255_255_255/0.2)]" style={{ backgroundColor: couleur }} />;
}

/**
 * Liste des couleurs de la palette, chacune avec sa pastille. Une liste
 * déroulante du système ne sait afficher que du texte : celle-ci est dessinée
 * par l'application, avec le même clavier (flèches, Entrée, Échap).
 */
export function ColorSelect({ id, libelle, valeur, palette, surChoix }: ColorSelectProps) {
  const [ouverte, definirOuverte] = useState(false);
  const nommee = (nomsDeCouleur as readonly string[]).includes(valeur);
  const affichee = nommee ? palette[valeur as ColorName] : valeur;
  const choix = [
    ...nomsDeCouleur.map((nom) => ({ cle: nom, libelle: libellesDeCouleur[nom], couleur: palette[nom] })),
    { cle: '', libelle: 'Couleur choisie…', couleur: affichee },
  ];
  const actuel = Math.max(
    0,
    choix.findIndex((element) => element.cle === (nommee ? valeur : '')),
  );
  const [actif, definirActif] = useState(actuel);
  const bouton = useRef<HTMLButtonElement>(null);
  const selecteur = useRef<HTMLInputElement>(null);
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
    if (element === undefined) {
      return;
    }
    if (element.cle !== '') {
      surChoix(element.cle);
      return;
    }
    // « Couleur choisie… » ouvre le sélecteur de couleur du système, qui part de la couleur affichée.
    const entree = selecteur.current;
    if (entree !== null) {
      try {
        entree.showPicker();
      } catch {
        entree.click();
      }
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
      evenement.preventDefault();
      evenement.stopPropagation();
      fermer();
    } else if (evenement.key === 'Tab') {
      definirOuverte(false);
    }
  };

  return (
    <div className="relative min-w-0 flex-1">
      <button
        ref={bouton}
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={ouverte}
        onClick={() => (ouverte ? fermer() : ouvrir())}
        onKeyDown={surToucheBouton}
        className="bg-fond text-texte hover:bg-texte/10 focus-visible:bg-texte/15 flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-0"
      >
        <Pastille couleur={affichee} />
        <span className="min-w-0 flex-1 truncate">{nommee ? choix[actuel]?.libelle : 'Couleur choisie'}</span>
        <ChevronDown className="text-discret size-4 flex-none" aria-hidden="true" />
      </button>
      {/* Le sélecteur du système, sans place à l'écran : on y arrive par « Couleur choisie… ». */}
      <input
        ref={selecteur}
        type="color"
        tabIndex={-1}
        aria-label={`Choisir ${libelle}`}
        value={surSixChiffres(affichee) ?? '#000000'}
        onChange={(evenement) => surChoix(evenement.target.value)}
        className="pointer-events-none absolute bottom-0 left-0 size-px opacity-0"
      />
      {ouverte && (
        <div
          ref={liste}
          role="listbox"
          tabIndex={-1}
          aria-label={libelle}
          aria-activedescendant={`${prefixe}-${actif}`}
          onKeyDown={surToucheListe}
          className="absolute top-full left-0 z-30 mt-1 max-h-96 w-full min-w-44 overflow-y-auto rounded-md bg-[color-mix(in_srgb,var(--color-texte)_10%,var(--color-surface))] py-1 shadow-xl shadow-black/40 outline-0"
        >
          {choix.map((element, index) => (
            <div
              key={element.cle}
              id={`${prefixe}-${index}`}
              role="option"
              aria-selected={index === actuel}
              onMouseEnter={() => definirActif(index)}
              onClick={() => choisir(index)}
              className={`flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-sm ${index === actif ? 'bg-texte/15' : ''}`}
            >
              <Pastille couleur={element.couleur} />
              <span className="flex-1">{element.libelle}</span>
              {index === actuel && <Check className="text-accent size-4" aria-hidden="true" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
