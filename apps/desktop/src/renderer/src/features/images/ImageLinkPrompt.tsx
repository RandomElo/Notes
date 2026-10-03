import { ImageDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface ImageLinkPromptProps {
  adresse: string;
  /** Où afficher la question : sous le curseur. */
  gauche: number;
  haut: number;
  /** Télécharge l'image ; rend le message d'erreur, ou null si elle est dans la page. */
  surTelechargement: () => Promise<string | null>;
  /** Garde le lien comme du texte. */
  surRefus: () => void;
}

/**
 * Question posée quand on colle le lien d'une image d'Internet (README §6) :
 * la télécharger dans le dossier de la page, ou garder le lien en texte.
 * Rien n'est chargé d'Internet sans cette réponse. `Échap` garde le lien.
 */
export function ImageLinkPrompt({ adresse, gauche, haut, surTelechargement, surRefus }: ImageLinkPromptProps) {
  const [enCours, definirEnCours] = useState(false);
  const premier = useRef<HTMLButtonElement>(null);
  // TipTap rend le focus à l'éditeur à l'image suivante : la question le prend après.
  useEffect(() => {
    const image = requestAnimationFrame(() => premier.current?.focus());
    return () => cancelAnimationFrame(image);
  }, []);

  return (
    <div
      role="dialog"
      aria-label="Image d'Internet"
      style={{ left: Math.max(8, Math.min(gauche, window.innerWidth - 328)), top: Math.min(haut, window.innerHeight - 140) }}
      onKeyDown={(evenement) => {
        if (evenement.key === 'Escape' && !enCours) {
          evenement.preventDefault();
          evenement.stopPropagation();
          surRefus();
        }
      }}
      className="border-bordure bg-surface fixed z-40 w-80 space-y-3 rounded-md border p-3 text-sm shadow-xl shadow-black/40"
    >
      <p className="flex items-start gap-2">
        <ImageDown className="text-accent mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          Télécharger cette image dans la page ?
          <span className="text-discret block truncate text-xs" title={adresse}>
            {adresse}
          </span>
        </span>
      </p>
      <div className="flex justify-end gap-2">
        <button type="button" disabled={enCours} onClick={surRefus} className="hover:bg-texte/10 focus-visible:bg-texte/20 rounded px-2 py-1 outline-0 disabled:opacity-50">
          Garder le lien
        </button>
        <button
          ref={premier}
          type="button"
          disabled={enCours}
          onClick={() => {
            definirEnCours(true);
            void surTelechargement().finally(() => definirEnCours(false));
          }}
          className="bg-accent/25 hover:bg-accent/40 focus-visible:bg-accent/50 rounded px-2 py-1 outline-0 disabled:opacity-50"
        >
          {enCours ? 'Téléchargement…' : 'Télécharger'}
        </button>
      </div>
    </div>
  );
}
