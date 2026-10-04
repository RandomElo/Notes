import { SpellCheck } from 'lucide-react';
import { useMagasinDeCorrection } from './spellcheck-store';

/** Nombre de fautes de la page ouverte, dans la barre de statut (README §11). Rien sans page ouverte ou sans correction prête. */
export function SpellCounter() {
  const { fautes } = useMagasinDeCorrection();
  if (fautes === null) {
    return null;
  }
  return (
    <span className="flex items-center gap-1.5 px-1.5" title="Fautes soulignées dans la page">
      <SpellCheck className={`size-3.5 ${fautes === 0 ? 'text-succes' : 'text-erreur'}`} aria-hidden="true" />
      {fautes === 0 ? 'Aucune faute' : fautes === 1 ? '1 faute' : `${fautes} fautes`}
    </span>
  );
}
