import { Info } from 'lucide-react';
import { useId } from 'react';

/** Petit « i » entouré : son explication apparaît au survol, et au clavier quand il a le focus. */
export function InfoTip({ texte, sujet }: { texte: string; sujet: string }) {
  const id = useId();
  return (
    <span className="group relative inline-flex align-middle">
      <button
        type="button"
        aria-label={`Aide : ${sujet}`}
        aria-describedby={id}
        className="text-discret hover:bg-texte/10 hover:text-texte focus-visible:bg-texte/20 focus-visible:text-texte rounded-full p-0.5 outline-0"
      >
        <Info className="size-3.5" aria-hidden="true" />
      </button>
      <span
        id={id}
        role="tooltip"
        className="bg-[color-mix(in_srgb,var(--color-texte)_16%,var(--color-surface))] text-texte pointer-events-none invisible absolute top-full left-0 z-30 mt-1 w-64 rounded-md p-2.5 text-xs leading-relaxed font-normal opacity-0 shadow-lg transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
      >
        {texte}
      </span>
    </span>
  );
}
