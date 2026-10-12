import { CloudOff, LoaderCircle, RefreshCw, ShieldAlert, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNotes } from '../state/NotesContext';
import { libelleDeLEtat } from '../state/sync-status';

/** État du NAS et dernière sync (README §15) ; toucher relance une sync. */
export function StatusPill() {
  const { etat, reglages, synchroniser } = useNotes();
  const [maintenant, definirMaintenant] = useState(() => Date.now());
  useEffect(() => {
    const minuterie = setInterval(() => definirMaintenant(Date.now()), 30_000);
    return () => clearInterval(minuterie);
  }, []);
  useEffect(() => definirMaintenant(Date.now()), [etat, reglages.derniereSync]);

  const Icone = { inconnu: RefreshCw, synchro: LoaderCircle, 'a-jour': RefreshCw, injoignable: CloudOff, refuse: ShieldAlert, erreur: TriangleAlert }[etat.genre];
  const couleur = etat.genre === 'injoignable' ? 'text-alerte' : etat.genre === 'refuse' || etat.genre === 'erreur' ? 'text-erreur' : 'text-discret';
  return (
    <button
      type="button"
      onClick={() => void synchroniser(true)}
      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm outline-none active:bg-texte/10 focus-visible:bg-texte/15 ${couleur}`}
    >
      <Icone className={`size-4 shrink-0 ${etat.genre === 'synchro' ? 'animate-spin' : ''}`} aria-hidden="true" />
      <span className="min-w-0 flex-1">{libelleDeLEtat(etat, reglages.derniereSync, maintenant, reglages.hoteTailscale !== '')}</span>
    </button>
  );
}
