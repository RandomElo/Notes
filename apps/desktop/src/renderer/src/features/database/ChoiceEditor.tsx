import type { BaseChoiceColor, BaseField } from '@notes/core';
import { couleurDuChoix } from '@notes/core';
import { couleurDuTheme } from '@notes/ui';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ChoicePill } from './ChoicePicker';
import { couleursDeChoixLibellees } from './database-model';
import { FloatingPanel } from './FloatingPanel';

interface ChoiceEditorProps {
  x: number;
  y: number;
  champ: BaseField;
  surAjouter: (nom: string) => void;
  /** Renomme le choix dans la liste et dans toutes les lignes. */
  surRenommer: (ancien: string, nouveau: string) => void;
  /** Retire le choix de la liste et des lignes qui l'avaient. */
  surRetirer: (nom: string) => void;
  surCouleur: (nom: string, couleur: BaseChoiceColor | null) => void;
  surDeplacer: (nom: string, pas: -1 | 1) => void;
  surFermeture: () => void;
}

const boutonDiscret = 'text-discret hover:bg-texte/10 hover:text-texte focus-visible:bg-texte/20 flex size-6 shrink-0 items-center justify-center rounded outline-0 disabled:opacity-30';

/**
 * Valeurs possibles d'un champ « choix », ouvertes depuis le menu de son en-tête : un clic sur une valeur
 * la renomme, sa pastille de couleur ouvre la palette, les flèches changent l'ordre (celui du tri).
 */
export function ChoiceEditor({ x, y, champ, surAjouter, surRenommer, surRetirer, surCouleur, surDeplacer, surFermeture }: ChoiceEditorProps) {
  const [renommage, definirRenommage] = useState<{ ancien: string; texte: string } | null>(null);
  const [palette, definirPalette] = useState<string | null>(null);
  const [nouveau, definirNouveau] = useState('');
  const liste = champ.choix ?? [];

  const validerRenommage = (): void => {
    if (renommage !== null && renommage.texte.trim() !== renommage.ancien) {
      surRenommer(renommage.ancien, renommage.texte);
    }
    definirRenommage(null);
  };

  return (
    <FloatingPanel x={x} y={y} libelle={`Valeurs possibles de ${champ.nom}`} surFermeture={surFermeture}>
      <p className="text-discret px-2 pt-1 pb-1.5 text-xs">Valeurs possibles de « {champ.nom} »</p>
      <ul className="max-h-72 overflow-y-auto">
        {liste.map((choix, rang) => (
          <li key={choix.nom}>
            <div className="hover:bg-texte/5 flex items-center gap-1 rounded px-1 py-0.5">
              <button
                type="button"
                aria-label={`Couleur de ${choix.nom}`}
                aria-expanded={palette === choix.nom}
                onClick={() => definirPalette(palette === choix.nom ? null : choix.nom)}
                className="hover:bg-texte/10 focus-visible:bg-texte/20 flex size-6 shrink-0 items-center justify-center rounded outline-0"
              >
                <span className="size-3 rounded-full" style={{ backgroundColor: couleurDuTheme(couleurDuChoix(champ, choix.nom) ?? 'muted') }} aria-hidden="true" />
              </button>
              {renommage?.ancien === choix.nom ? (
                <input
                  autoFocus
                  aria-label={`Nouveau nom de ${choix.nom}`}
                  value={renommage.texte}
                  onChange={(evenement) => definirRenommage({ ...renommage, texte: evenement.target.value })}
                  onBlur={validerRenommage}
                  onKeyDown={(evenement) => {
                    if (evenement.key === 'Enter') {
                      evenement.preventDefault();
                      validerRenommage();
                    } else if (evenement.key === 'Escape') {
                      evenement.preventDefault();
                      evenement.stopPropagation();
                      definirRenommage(null);
                    }
                  }}
                  className="bg-fond min-w-0 flex-1 rounded px-1 outline-0"
                />
              ) : (
                <button
                  type="button"
                  title="Renommer"
                  aria-label={`Renommer ${choix.nom}`}
                  onClick={() => definirRenommage({ ancien: choix.nom, texte: choix.nom })}
                  className="hover:bg-texte/10 focus-visible:bg-texte/20 flex min-w-0 flex-1 rounded px-1 py-0.5 text-left outline-0"
                >
                  <ChoicePill champ={champ} valeur={choix.nom} />
                </button>
              )}
              <button type="button" aria-label={`Monter ${choix.nom}`} disabled={rang === 0} onClick={() => surDeplacer(choix.nom, -1)} className={boutonDiscret}>
                <ArrowUp className="size-3.5" aria-hidden="true" />
              </button>
              <button type="button" aria-label={`Descendre ${choix.nom}`} disabled={rang === liste.length - 1} onClick={() => surDeplacer(choix.nom, 1)} className={boutonDiscret}>
                <ArrowDown className="size-3.5" aria-hidden="true" />
              </button>
              <button type="button" aria-label={`Retirer ${choix.nom}`} title="Retirer (les lignes qui l'ont se vident)" onClick={() => surRetirer(choix.nom)} className={boutonDiscret}>
                <Trash2 className="size-3.5" aria-hidden="true" />
              </button>
            </div>
            {palette === choix.nom && (
              <div role="group" aria-label={`Couleurs pour ${choix.nom}`} className="flex flex-wrap gap-1 py-1 pr-1 pl-8">
                <button
                  type="button"
                  aria-pressed={choix.couleur === null}
                  onClick={() => surCouleur(choix.nom, null)}
                  className={`hover:bg-texte/10 focus-visible:bg-texte/20 rounded px-1.5 py-0.5 text-xs outline-0 ${choix.couleur === null ? 'bg-accent/25' : ''}`}
                >
                  Auto
                </button>
                {couleursDeChoixLibellees.map(({ couleur, libelle }) => (
                  <button
                    key={couleur}
                    type="button"
                    aria-label={libelle}
                    title={libelle}
                    aria-pressed={choix.couleur === couleur}
                    onClick={() => surCouleur(choix.nom, couleur)}
                    className={`hover:bg-texte/10 focus-visible:bg-texte/20 flex size-6 items-center justify-center rounded outline-0 ${choix.couleur === couleur ? 'bg-accent/25' : ''}`}
                  >
                    <span className="size-3 rounded-full" style={{ backgroundColor: couleurDuTheme(couleur) }} aria-hidden="true" />
                  </button>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
      <form
        onSubmit={(evenement) => {
          evenement.preventDefault();
          if (nouveau.trim() !== '') {
            surAjouter(nouveau);
          }
          definirNouveau('');
        }}
        className="mt-1 flex items-center gap-1 px-1"
      >
        <Plus className="text-discret size-4 shrink-0" aria-hidden="true" />
        <input
          autoFocus={liste.length === 0}
          aria-label="Nouvelle valeur"
          placeholder="Nouvelle valeur, puis Entrée"
          value={nouveau}
          onChange={(evenement) => definirNouveau(evenement.target.value)}
          className="bg-fond min-w-0 flex-1 rounded px-2 py-1 outline-0"
        />
      </form>
    </FloatingPanel>
  );
}

