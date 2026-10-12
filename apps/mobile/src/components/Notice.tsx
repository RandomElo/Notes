import { useEffect } from 'react';
import { useNotes } from '../state/NotesContext';

/** Message bref en bas de l'écran (modification refusée), effacé au bout de 6 s ou d'un toucher. */
export function Notice() {
  const { avis, montrerAvis } = useNotes();
  useEffect(() => {
    if (avis === null) {
      return;
    }
    const minuterie = setTimeout(() => montrerAvis(null), 6000);
    return () => clearTimeout(minuterie);
  }, [avis, montrerAvis]);
  if (avis === null) {
    return null;
  }
  return (
    <div className="marge-bas pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4">
      <button
        type="button"
        role="status"
        onClick={() => montrerAvis(null)}
        className="pointer-events-auto max-w-md rounded-xl bg-texte px-4 py-3 text-left text-sm text-fond shadow-lg outline-none"
      >
        {avis}
      </button>
    </div>
  );
}
