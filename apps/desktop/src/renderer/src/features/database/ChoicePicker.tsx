import type { BaseField } from '@notes/core';
import { nomDeChoixValide } from '@notes/core';
import { Check, Plus } from 'lucide-react';
import { useState } from 'react';
import { normaliser } from '../slash-menu/slash-commands';
import { couleurDeChoix } from './database-model';
import { FloatingPanel } from './FloatingPanel';

interface ChoicePickerProps {
  x: number;
  y: number;
  champ: BaseField;
  /** Ce que la ligne a déjà, ou la chaîne vide. */
  actuelle: string;
  /** Titre de la ligne, pour les lecteurs d'écran. */
  ligne: string;
  /** Le choix retenu ; la chaîne vide retire la valeur. Un nom absent de la liste s'y ajoute (côté core). */
  surChoix: (valeur: string) => void;
  surFermeture: () => void;
}

/** Une valeur d'un champ « choix » en pastille de sa couleur. */
export function ChoicePill({ champ, valeur }: { champ: BaseField; valeur: string }) {
  const couleur = couleurDeChoix(champ, valeur);
  return (
    <span className="max-w-full truncate rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: `color-mix(in srgb, ${couleur} 25%, transparent)`, color: couleur }}>
      {valeur}
    </span>
  );
}

/**
 * Liste d'une cellule « choix » : on tape pour filtrer (sans tenir compte des accents), les flèches
 * parcourent, Entrée retient. Un texte qui n'est pas dans la liste propose de créer cette valeur.
 */
export function ChoicePicker({ x, y, champ, actuelle, ligne, surChoix, surFermeture }: ChoicePickerProps) {
  const [saisie, definirSaisie] = useState('');
  const [actif, definirActif] = useState(0);
  const recherche = normaliser(saisie);
  const proposes = (champ.choix ?? []).filter((choix) => normaliser(choix.nom).includes(recherche));
  const propre = saisie.trim();
  // « code » ne se crée pas à côté de « Code » : à la casse et aux accents près, c'est la même valeur.
  const aCreer = propre !== '' && nomDeChoixValide(propre) && !(champ.choix ?? []).some((choix) => normaliser(choix.nom) === recherche);
  // Ce qu'on peut retenir, dans l'ordre de la liste : les choix filtrés, la création, puis « Aucun ».
  const elements = [...proposes.map((choix) => ({ cle: `choix:${choix.nom}`, valeur: choix.nom })), ...(aCreer ? [{ cle: 'creer', valeur: propre }] : []), { cle: 'aucun', valeur: '' }];
  const rangActif = Math.min(actif, elements.length - 1);

  const retenir = (valeur: string): void => {
    surFermeture();
    surChoix(valeur);
  };

  return (
    <FloatingPanel x={x} y={y} libelle={`${champ.nom} de ${ligne}`} surFermeture={surFermeture}>
      <input
        autoFocus
        aria-label="Chercher ou créer une valeur"
        placeholder="Chercher ou créer une valeur"
        value={saisie}
        onChange={(evenement) => {
          definirSaisie(evenement.target.value);
          definirActif(0);
        }}
        onKeyDown={(evenement) => {
          if (evenement.key === 'ArrowDown' || evenement.key === 'ArrowUp') {
            evenement.preventDefault();
            const pas = evenement.key === 'ArrowDown' ? 1 : -1;
            definirActif((rangActif + pas + elements.length) % elements.length);
          } else if (evenement.key === 'Enter') {
            evenement.preventDefault();
            retenir(elements[rangActif]!.valeur);
          }
        }}
        className="bg-fond mb-1 w-full rounded px-2 py-1 outline-0"
      />
      <div role="listbox" aria-label="Valeurs possibles" className="max-h-64 overflow-y-auto">
        {elements.map((element, rang) => (
          <button
            key={element.cle}
            type="button"
            role="option"
            aria-selected={rang === rangActif}
            tabIndex={-1}
            onMouseEnter={() => definirActif(rang)}
            onClick={() => retenir(element.valeur)}
            className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left outline-0 ${rang === rangActif ? 'bg-bordure/60' : ''}`}
          >
            {element.cle === 'creer' ? (
              <>
                <Plus className="text-discret size-4 shrink-0" aria-hidden="true" />
                <span className="truncate">Créer « {element.valeur} »</span>
              </>
            ) : element.cle === 'aucun' ? (
              <span className="text-discret">Aucun</span>
            ) : (
              <ChoicePill champ={champ} valeur={element.valeur} />
            )}
            {element.cle !== 'creer' && element.valeur === actuelle && <Check className="text-accent ml-auto size-4 shrink-0" aria-label="valeur actuelle" />}
          </button>
        ))}
      </div>
    </FloatingPanel>
  );
}
