import { verifierTitre } from '@notes/core';
import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

interface PageTitleProps {
  titre: string;
  /** Renomme la page. Rend le message d'erreur si le renommage a échoué, null sinon. */
  surRenommage: (titre: string) => Promise<string | null>;
  /** Entrée ou flèche bas : le curseur passe dans le contenu. */
  surDescente: () => void;
}

/**
 * Titre de la page, modifiable sur place (README §6). C'est le niveau 1 de la
 * page. Il est enregistré quand on le quitte : la page est renommée, son
 * dossier aussi. Échap annule la saisie.
 */
export function PageTitle({ titre, surRenommage, surDescente }: PageTitleProps) {
  const champ = useRef<HTMLHeadingElement>(null);
  const [erreur, definirErreur] = useState<string | null>(null);

  // Le titre peut changer ailleurs (arborescence, autre outil) : le champ suit, sauf pendant la saisie.
  useEffect(() => {
    if (champ.current !== null && document.activeElement !== champ.current) {
      champ.current.textContent = titre;
    }
  }, [titre]);

  const valider = async (): Promise<void> => {
    const element = champ.current;
    if (element === null) {
      return;
    }
    const saisi = (element.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (saisi === titre) {
      element.textContent = titre;
      definirErreur(null);
      return;
    }
    const refus = verifierTitre(saisi) ?? (await surRenommage(saisi));
    if (refus !== null) {
      // Le titre d'avant revient : un titre refusé ne doit pas rester affiché comme s'il était enregistré.
      element.textContent = titre;
    }
    definirErreur(refus);
  };

  const surTouche = (evenement: KeyboardEvent<HTMLHeadingElement>): void => {
    if (evenement.key === 'Enter' || evenement.key === 'ArrowDown') {
      evenement.preventDefault();
      surDescente();
    } else if (evenement.key === 'Escape') {
      evenement.preventDefault();
      if (champ.current !== null) {
        champ.current.textContent = titre;
      }
      surDescente();
    }
    // Les raccourcis de l'application (Ctrl+N...) continuent de fonctionner, le reste est pour le champ.
  };

  return (
    <div className="mt-6 mb-6">
      {/* Texte brut seulement : ni mise en forme collée, ni retour à la ligne. */}
      <h2
        ref={champ}
        contentEditable="plaintext-only"
        suppressContentEditableWarning
        role="textbox"
        aria-label="Titre de la page"
        aria-invalid={erreur !== null}
        spellCheck={false}
        data-placeholder="Sans titre"
        onKeyDown={surTouche}
        onBlur={() => void valider()}
        onInput={() => definirErreur(null)}
        className="titre-de-page text-[2.4rem] leading-tight font-extrabold outline-0"
      />
      {erreur !== null && (
        <p role="alert" className="text-erreur mt-1 text-sm">
          Titre non enregistré : {erreur}
        </p>
      )}
    </div>
  );
}
