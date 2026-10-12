import { Mic, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useFermetureParRetour } from '../../state/navigation';
import { dureeLisible } from './memo-labels';
import { useMemos } from './MemosContext';

const barres = 32;

/**
 * Écran d'un enregistrement en cours, par-dessus tout : durée, niveau du son,
 * « Terminer » qui range le mémo et l'envoie, « Annuler » qui le jette (choix
 * d'Eloi, 2026-10-11, pas de réécoute). Retour revient à l'accueil sans
 * l'arrêter, quitter l'application non plus : la notification d'Android le
 * termine aussi.
 */
export function RecordingScreen() {
  const { enregistrement, ecranVisible, montrerEcran, terminer, annuler } = useMemos();
  const [occupe, definirOccupe] = useState(false);
  const niveaux = useRef<number[]>(Array.from({ length: barres }, () => 0));
  // Retour revient à l'accueil, l'enregistrement continue (choix d'Eloi, 2026-10-11).
  useFermetureParRetour(enregistrement !== null && ecranVisible, () => montrerEcran(false));

  const niveau = enregistrement?.niveau ?? 0;
  useEffect(() => {
    // La racine fait ressortir une voix normale, qui reste loin du maximum.
    niveaux.current = [...niveaux.current.slice(1), Math.sqrt(niveau)];
  }, [niveau, enregistrement]);

  if (enregistrement === null || !ecranVisible) {
    return null;
  }
  const finir = async (action: () => Promise<void>): Promise<void> => {
    definirOccupe(true);
    try {
      await action();
    } finally {
      definirOccupe(false);
    }
  };

  return (
    <div role="dialog" aria-label="Enregistrement d’un mémo" className="marge-bas fixed inset-0 z-40 flex flex-col items-center justify-center gap-10 bg-fond px-8">
      <div className="flex items-center gap-2 text-discret">
        <Mic className="size-5 animate-pulse text-erreur" aria-hidden="true" />
        <span>Enregistrement en cours</span>
      </div>
      <p className="text-6xl font-light tabular-nums" aria-live="off">
        {dureeLisible(Date.now() - enregistrement.depuis)}
      </p>
      <div className="flex h-20 w-full max-w-xs items-center justify-between" aria-hidden="true">
        {niveaux.current.map((valeur, rang) => (
          <span key={rang} className="w-1.5 rounded-full bg-accent" style={{ height: `${Math.max(6, Math.round(valeur * 100))}%` }} />
        ))}
      </div>
      <div className="flex flex-col items-center gap-4">
        <button
          type="button"
          disabled={occupe}
          onClick={() => void finir(terminer)}
          className="flex items-center gap-3 rounded-full bg-accent px-8 py-4 text-lg font-medium text-white outline-none active:brightness-90 focus-visible:brightness-110 disabled:opacity-60"
        >
          <Square className="size-5 fill-current" aria-hidden="true" />
          Terminer
        </button>
        <button
          type="button"
          disabled={occupe}
          onClick={() => void finir(annuler)}
          className="rounded-lg px-5 py-3 text-discret outline-none active:bg-texte/10 focus-visible:bg-texte/15 disabled:opacity-60"
        >
          Annuler
        </button>
      </div>
      <p className="max-w-xs text-center text-sm text-discret">Tu peux revenir à l’accueil ou éteindre l’écran : l’enregistrement continue, et se termine aussi depuis sa notification.</p>
    </div>
  );
}
