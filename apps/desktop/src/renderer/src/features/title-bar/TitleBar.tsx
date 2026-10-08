import { Copy, Minus, RefreshCw, Square, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import icone from '../../../../../resources/icon/64x64.png';
import { api } from '../../lib/ipc';

interface TitleBarProps {
  /** Dossier des notes ouvert, montré au survol du nom de l'application. */
  dossier: string | null;
  /** Les onglets, entre le nom de l'application et les boutons de fenêtre. */
  children?: ReactNode;
}

/**
 * Barre de titre de l'application, à la place du cadre du système : nom,
 * version, puis les boutons de fenêtre à droite. Toute la barre sert à
 * déplacer la fenêtre, sauf les boutons.
 */
export function TitleBar({ dossier, children }: TitleBarProps) {
  const [version, definirVersion] = useState('');
  const [agrandie, definirAgrandie] = useState(false);
  const [miseAJour, definirMiseAJour] = useState(false);

  useEffect(() => {
    void api.version().then(definirVersion);
    void api.fenetreEstAgrandie().then(definirAgrandie);
    return api.surFenetreAgrandie(definirAgrandie);
  }, []);

  useEffect(() => {
    void api.miseAJourEnAttente().then((enAttente) => enAttente && definirMiseAJour(true));
    return api.surMiseAJourInstallee(() => definirMiseAJour(true));
  }, []);

  return (
    <header className="zone-de-deplacement border-bordure flex h-10 shrink-0 items-stretch border-b select-none">
      <div className="flex min-w-0 flex-1 items-center gap-3 pl-4">
        <div className="flex shrink-0 items-center gap-3" title={dossier === null ? undefined : `Dossier des notes : ${dossier}`}>
          <img src={icone} alt="" className="size-5 shrink-0" draggable={false} />
          <h1 className="shrink-0 text-sm font-semibold">Notes</h1>
          {version !== '' && <span className="text-discret shrink-0 text-xs whitespace-nowrap">version {version}</span>}
        </div>
        {/* Une marge à droite des onglets reste libre pour déplacer la fenêtre. */}
        <div className="flex h-full min-w-0 flex-1 pr-12">{children}</div>
      </div>

      {miseAJour && (
        <button
          type="button"
          onClick={() => void api.relancerNotes()}
          title="Une nouvelle version de Notes vient d'être installée. La page est enregistrée avant de relancer."
          className="hors-deplacement bg-accent/20 hover:bg-accent/35 focus-visible:bg-accent/45 my-1.5 mr-2 inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium whitespace-nowrap outline-0"
        >
          <RefreshCw className="size-3.5" aria-hidden="true" />
          Nouvelle version · Relancer
        </button>
      )}

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
