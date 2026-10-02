import { nomsDeCouleur, refus } from '@notes/ui';
import type { ColorName, FieldKind } from '@notes/ui';
import { RotateCcw } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { decouperTaille, libellesDeCouleur, surSixChiffres, unitesDeTaille } from './theme-form-model';

interface ThemeFieldProps {
  libelle: string;
  genre: FieldKind;
  valeur: unknown;
  parDefaut: unknown;
  /** La palette en cours : une couleur libre part de celle que le nom désignait. */
  palette: Record<ColorName, string>;
  /** Appelé seulement avec une valeur acceptée par le thème. */
  surChangement: (valeur: unknown) => void;
}

const apparenceDeChamp = 'bg-fond focus:bg-texte/15 hover:bg-texte/10 rounded-md px-2 py-1.5 text-sm outline-0';
const classeDeChamp = `${apparenceDeChamp} w-full min-w-0`;
/** Dans une rangée de deux champs : le premier prend la place qui reste. */
const classeDeChampEtire = `${apparenceDeChamp} min-w-0 flex-1`;
const graisses = [
  [100, 'Très fin'],
  [200, 'Extra-fin'],
  [300, 'Fin'],
  [400, 'Normal'],
  [500, 'Moyen'],
  [600, 'Demi-gras'],
  [700, 'Gras'],
  [800, 'Extra-gras'],
  [900, 'Noir'],
] as const;

/** Un réglage du thème : le champ adapté à sa nature, son message si la saisie est refusée, et le retour au défaut. */
export function ThemeField({ libelle, genre, valeur, parDefaut, palette, surChangement }: ThemeFieldProps) {
  const id = useId();
  // Ce qui est tapé, même si ce n'est pas encore une valeur acceptée : une saisie en cours ne doit pas être effacée.
  const [saisie, definirSaisie] = useState<string | null>(null);
  const [attendu, definirAttendu] = useState<string | null>(null);
  useEffect(() => {
    definirSaisie(null);
    definirAttendu(null);
  }, [valeur]);

  const proposer = (candidate: unknown, tape: string): void => {
    const refuse = refus(genre, candidate);
    definirAttendu(refuse);
    if (refuse === null) {
      definirSaisie(null);
      surChangement(candidate);
    } else {
      definirSaisie(tape);
    }
  };
  const texte = saisie ?? String(valeur);

  let champ;
  switch (genre) {
    case 'booleen':
      champ = (
        <input id={id} type="checkbox" checked={valeur === true} onChange={(evenement) => surChangement(evenement.target.checked)} className="accent-accent size-4" />
      );
      break;
    case 'graisse':
      champ = (
        <select id={id} value={String(valeur)} onChange={(evenement) => surChangement(Number(evenement.target.value))} className={classeDeChamp}>
          {graisses.map(([nombre, nom]) => (
            <option key={nombre} value={nombre}>
              {nombre} · {nom}
            </option>
          ))}
        </select>
      );
      break;
    case 'interligne':
      champ = (
        <input
          id={id}
          type="number"
          min={1}
          max={3}
          step={0.05}
          value={texte}
          onChange={(evenement) => proposer(evenement.target.value === '' ? null : Number(evenement.target.value), evenement.target.value)}
          className={classeDeChamp}
        />
      );
      break;
    case 'duree': {
      const millisecondes = saisie ?? String(valeur).replace(/ms$/, '');
      champ = (
        <div className="flex items-center gap-2">
          <input
            id={id}
            type="number"
            min={0}
            max={2000}
            step={10}
            value={millisecondes}
            onChange={(evenement) => proposer(`${evenement.target.value}ms`, evenement.target.value)}
            className={classeDeChampEtire}
          />
          <span className="text-discret text-sm">ms</span>
        </div>
      );
      break;
    }
    case 'taille': {
      const morceaux = decouperTaille(String(valeur)) ?? { nombre: '1', unite: 'rem' };
      champ = (
        <div className="flex gap-2">
          <input
            id={id}
            type="number"
            min={0}
            step={morceaux.unite === 'px' || morceaux.unite === '%' ? 1 : 0.05}
            value={saisie ?? morceaux.nombre}
            onChange={(evenement) => proposer(`${evenement.target.value}${morceaux.unite}`, evenement.target.value)}
            className={classeDeChampEtire}
          />
          <select
            aria-label={`Unité de ${libelle}`}
            value={morceaux.unite}
            onChange={(evenement) => surChangement(`${morceaux.nombre}${evenement.target.value}`)}
            className={`${apparenceDeChamp} w-20 flex-none`}
          >
            {unitesDeTaille.map((unite) => (
              <option key={unite}>{unite}</option>
            ))}
          </select>
        </div>
      );
      break;
    }
    case 'couleur':
    case 'reference': {
      const nommee = genre === 'reference' && (nomsDeCouleur as readonly unknown[]).includes(valeur);
      champ = (
        <div className="flex items-center gap-2">
          {genre === 'reference' && (
            <select
              id={id}
              value={nommee ? String(valeur) : ''}
              // « Autre couleur » part de la couleur que le nom désignait : rien ne change à l'écran tant qu'on n'a pas choisi.
              onChange={(evenement) => surChangement(evenement.target.value === '' ? palette[valeur as ColorName] : evenement.target.value)}
              className={nommee ? classeDeChamp : `${apparenceDeChamp} w-32 flex-none`}
            >
              {nomsDeCouleur.map((nom) => (
                <option key={nom} value={nom}>
                  {libellesDeCouleur[nom]}
                </option>
              ))}
              <option value="">Autre couleur</option>
            </select>
          )}
          {!nommee && (
            <>
              <input
                type="color"
                aria-label={`Choisir ${libelle}`}
                value={surSixChiffres(String(valeur)) ?? '#000000'}
                onChange={(evenement) => surChangement(evenement.target.value)}
                className="bg-fond h-8 w-10 flex-none cursor-pointer rounded-md p-1"
              />
              <input
                id={genre === 'couleur' ? id : undefined}
                aria-label={genre === 'couleur' ? undefined : `Code de ${libelle}`}
                value={texte}
                spellCheck={false}
                onChange={(evenement) => proposer(evenement.target.value.trim(), evenement.target.value)}
                className={`${classeDeChampEtire} font-mono`}
              />
            </>
          )}
        </div>
      );
      break;
    }
    case 'police':
      champ = (
        <input id={id} value={texte} spellCheck={false} onChange={(evenement) => proposer(evenement.target.value, evenement.target.value)} className={classeDeChamp} />
      );
      break;
  }

  const modifie = JSON.stringify(valeur) !== JSON.stringify(parDefaut);
  return (
    <div className={genre === 'booleen' ? 'flex items-center gap-2' : 'space-y-1'}>
      <div className={`flex items-center justify-between gap-2 ${genre === 'booleen' ? 'order-2 flex-1' : ''}`}>
        <label htmlFor={id} className="text-discret text-xs">
          {libelle}
        </label>
        {modifie && (
          <button
            type="button"
            onClick={() => surChangement(parDefaut)}
            aria-label={`Rétablir ${libelle}`}
            title="Rétablir la valeur par défaut"
            className="text-discret hover:bg-texte/10 hover:text-texte focus-visible:bg-texte/20 rounded p-0.5 outline-0"
          >
            <RotateCcw className="size-3" aria-hidden="true" />
          </button>
        )}
      </div>
      {champ}
      {attendu !== null && (
        <p role="alert" className="text-erreur text-xs">
          Attendu : {attendu}.
        </p>
      )}
    </div>
  );
}
