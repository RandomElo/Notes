import { Copy, Minus, NotebookText, Square, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '../../lib/ipc';

interface TitleBarProps {
  /** Dossier des notes ouvert, affiché à titre d'information. */
  dossier: string | null;
}

/**
 * Barre de titre de l'application, à la place du cadre du système : nom,
 * version, puis les boutons de fenêtre à droite. Toute la barre sert à
 * déplacer la fenêtre, sauf les boutons.
 */
export function TitleBar({ dossier }: TitleBarProps) {
  const [version, definirVersion] = useState('');
  const [agrandie, definirAgrandie] = useState(false);

  useEffect(() => {
    void api.version().then(definirVersion);
    void api.fenetreEstAgrandie().then(definirAgrandie);
    return api.surFenetreAgrandie(definirAgrandie);
  }, []);

  return (
    <header className="zone-de-deplacement border-bordure flex h-10 shrink-0 items-stretch border-b select-none">
      <div className="flex min-w-0 flex-1 items-center gap-3 pl-4">
        <NotebookText className="text-accent size-5 shrink-0" aria-hidden="true" />
        <h1 className="shrink-0 text-sm font-semibold">Notes</h1>
        {version !== '' && <span className="text-discret shrink-0 text-xs whitespace-nowrap">version {version}</span>}
        {dossier !== null && (
          <span className="text-discret ml-auto min-w-0 truncate pr-3 text-xs" title={`Dossier des notes : ${dossier}`}>
            {dossier}
          </span>
        )}
      </div>

      <div className="hors-deplacement flex shrink-0">
        <WindowButton libelle="Réduire" surClic={() => void api.reduireFenetre()}>
          <Minus className="size-4" aria-hidden="true" />
        </WindowButton>
        <WindowButton
          libelle={agrandie ? 'Restaurer' : 'Agrandir'}
          surClic={() => void api.basculerAgrandissementFenetre().then(definirAgrandie)}
        >
          {agrandie ? <Copy className="size-3.5 -scale-x-100" aria-hidden="true" /> : <Square className="size-3.5" aria-hidden="true" />}
        </WindowButton>
        <WindowButton libelle="Fermer" fermeture surClic={() => void api.fermerFenetre()}>
          <X className="size-4" aria-hidden="true" />
        </WindowButton>
      </div>
    </header>
  );
}

function WindowButton(props: { libelle: string; surClic: () => void; fermeture?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={props.surClic}
      aria-label={props.libelle}
      title={props.libelle}
      className={`text-discret flex w-11 items-center justify-center outline-0 ${
        props.fermeture === true
          ? 'hover:bg-erreur hover:text-fond focus-visible:bg-erreur focus-visible:text-fond'
          : 'hover:bg-texte/10 hover:text-texte focus-visible:bg-texte/20 focus-visible:text-texte'
      }`}
    >
      {props.children}
    </button>
  );
}
