import { refus } from '@notes/ui';
import type { ColorName, FieldKind } from '@notes/ui';
import { RotateCcw } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { ColorSelect } from './ColorSelect';
import { InfoTip } from './InfoTip';
import { decouperTaille, policeDeValeur, surSixChiffres, unitesDeTaille, valeurDePolice } from './theme-form-model';
import type { FontFamilyKind } from './theme-form-model';

interface ThemeFieldProps {
  libelle: string;
  genre: FieldKind;
  valeur: unknown;
  parDefaut: unknown;
  /** La palette en cours : une couleur nommée s'affiche avec sa valeur. */
  palette: Record<ColorName, string>;
  /** Explication en infobulle, à côté du libellé. */
  aide?: string;
  /** Pour une police : la famille et les polices installées à proposer. */
  police?: { famille: FontFamilyKind; installees: string[] };
  /** Appelé seulement avec une valeur acceptée par le thème. */
  surChangement: (valeur: unknown) => void;
}

const apparenceDeChamp = 'bg-fond text-texte focus:bg-texte/15 hover:bg-texte/10 rounded-md px-2 py-1.5 text-sm outline-0';
const classeDeChamp = `${apparenceDeChamp} w-full min-w-0`;
/** Dans une rangée de deux champs : le premier prend la place qui reste. */
const classeDeChampEtire = `${apparenceDeChamp} min-w-0 flex-1`;
const classeDuCarre = 'bg-fond hover:bg-texte/10 h-8 w-10 flex-none cursor-pointer rounded-md p-1';
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
export function ThemeField({ libelle, genre, valeur, parDefaut, palette, aide, police, surChangement }: ThemeFieldProps) {
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
    case 'duree':
      champ = (
        <div className="flex items-center gap-2">
          <input
            id={id}
            type="number"
            min={0}
            max={2000}
            step={10}
            value={saisie ?? String(valeur).replace(/ms$/, '')}
            onChange={(evenement) => proposer(`${evenement.target.value}ms`, evenement.target.value)}
            className={classeDeChampEtire}
          />
          <span className="text-discret text-sm">ms</span>
        </div>
      );
      break;
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
      // Une couleur de la palette : le carré pour la choisir, son code pour la taper.
      champ = (
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label={`Choisir ${libelle}`}
            value={surSixChiffres(String(valeur)) ?? '#000000'}
            onChange={(evenement) => surChangement(evenement.target.value)}
            className={classeDuCarre}
          />
          <input
            id={id}
            value={texte}
            spellCheck={false}
            onChange={(evenement) => proposer(evenement.target.value.trim(), evenement.target.value)}
            className={`${classeDeChampEtire} font-mono`}
          />
        </div>
      );
      break;
    case 'reference':
      // Une couleur qui peut renvoyer à la palette : tout se choisit dans la liste, « Couleur choisie… » compris.
      champ = <ColorSelect id={id} libelle={libelle} valeur={String(valeur)} palette={palette} surChoix={surChangement} />;
      break;
    case 'police': {
      const famille = police?.famille ?? 'texte';
      const choisie = policeDeValeur(String(valeur), famille);
      const systeme = valeur === parDefaut;
      champ = (
        <select
          id={id}
          value={systeme ? 'systeme' : (choisie ?? 'autre')}
          onChange={(evenement) => surChangement(evenement.target.value === 'systeme' ? parDefaut : valeurDePolice(evenement.target.value, famille))}
          style={{ fontFamily: String(valeur) }}
          className={classeDeChamp}
        >
          <option value="systeme" style={{ fontFamily: String(parDefaut) }}>
            {famille === 'code' ? 'Police à chasse fixe du système' : 'Police du système'}
          </option>
          {/* Une valeur écrite à la main dans le fichier reste affichée telle quelle. */}
          {!systeme && choisie === null && <option value="autre">Écrite dans le fichier : {String(valeur)}</option>}
          {(police?.installees ?? []).map((nom) => (
            <option key={nom} value={nom} style={{ fontFamily: valeurDePolice(nom, famille) }}>
              {nom}
            </option>
          ))}
        </select>
      );
      break;
    }
  }

  const modifie = JSON.stringify(valeur) !== JSON.stringify(parDefaut);
  return (
    <div className={genre === 'booleen' ? 'flex items-center gap-2' : 'space-y-1'}>
      <div className={`flex items-center justify-between gap-2 ${genre === 'booleen' ? 'order-2 flex-1' : ''}`}>
        <span className="flex items-center gap-1">
          <label htmlFor={id} className="text-discret text-xs">
            {libelle}
          </label>
          {aide !== undefined && <InfoTip texte={aide} sujet={libelle} />}
        </span>
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
