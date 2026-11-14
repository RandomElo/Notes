import { FileText } from 'lucide-react';
import { useEffect, useRef } from 'react';

interface MarkdownPastePromptProps {
  /** Où afficher la question : sous le curseur. */
  gauche: number;
  haut: number;
  surMiseEnForme: () => void;
  surTexte: () => void;
}

/**
 * Question posée quand on colle du texte qui ressemble à du Markdown (docs/spec/editeur.md) : le mettre en forme dans la
 * page, ou le garder en texte. Rien n'est collé avant la réponse. `Échap` le garde en texte.
 */
export function MarkdownPastePrompt({ gauche, haut, surMiseEnForme, surTexte }: MarkdownPastePromptProps) {
  const premier = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const image = requestAnimationFrame(() => premier.current?.focus());
    return () => cancelAnimationFrame(image);
  }, []);

  return (
    <div
      role="dialog"
      aria-label="Texte Markdown collé"
      style={{ left: Math.max(8, Math.min(gauche, window.innerWidth - 328)), top: Math.min(haut, window.innerHeight - 140) }}
      onKeyDown={(evenement) => {
        if (evenement.key === 'Escape') {
          evenement.preventDefault();
          evenement.stopPropagation();
          surTexte();
        }
      }}
      className="border-bordure bg-surface fixed z-40 w-80 space-y-3 rounded-md border p-3 text-sm shadow-xl shadow-black/40"
    >
      <p className="flex items-start gap-2">
        <FileText className="text-accent mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>Ce texte ressemble à du Markdown. Le mettre en forme dans la page ?</span>
      </p>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={surTexte} className="hover:bg-texte/10 focus-visible:bg-texte/20 rounded px-2 py-1 outline-0">
          Garder en texte
        </button>
        <button ref={premier} type="button" onClick={surMiseEnForme} className="bg-accent/25 hover:bg-accent/40 focus-visible:bg-accent/50 rounded px-2 py-1 outline-0">
          Mettre en forme
        </button>
      </div>
    </div>
  );
}
