import { useId } from 'react';

interface TextFieldProps {
  libelle: string;
  valeur: string;
  surChangement: (valeur: string) => void;
  type?: 'text' | 'password';
  aide?: string;
  indication?: string;
  erreur?: string | undefined;
}

/** Champ de formulaire avec son libellé, une aide et un message d'erreur reliés pour les lecteurs d'écran. */
export function TextField({ libelle, valeur, surChangement, type = 'text', aide, indication, erreur }: TextFieldProps) {
  const id = useId();
  const idAide = `${id}-aide`;
  const idErreur = `${id}-erreur`;
  const description = [aide !== undefined ? idAide : '', erreur !== undefined ? idErreur : ''].join(' ').trim();

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {libelle}
      </label>
      <input
        id={id}
        type={type}
        value={valeur}
        placeholder={indication}
        onChange={(evenement) => surChangement(evenement.target.value)}
        aria-invalid={erreur !== undefined}
        aria-describedby={description === '' ? undefined : description}
        autoComplete="off"
        spellCheck={false}
        className={`bg-fond placeholder:text-discret/70 focus:outline-accent mt-1 w-full rounded-md border px-3 py-2 text-sm focus:outline-2 focus:outline-offset-1 ${
          erreur !== undefined ? 'border-erreur' : 'border-bordure'
        }`}
      />
      {aide !== undefined && (
        <p id={idAide} className="text-discret mt-1 text-xs">
          {aide}
        </p>
      )}
      {erreur !== undefined && (
        <p id={idErreur} className="text-erreur mt-1 text-xs">
          {erreur}
        </p>
      )}
    </div>
  );
}
