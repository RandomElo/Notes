import { SpellCheck } from 'lucide-react';
import { useState } from 'react';
import type { EditorView } from '@tiptap/pm/view';
import { SpellcheckDialog } from './SpellcheckDialog';
import { vueDeLaPageOuverte } from './spellcheck-extension';
import { useMagasinDeCorrection } from './spellcheck-store';

/**
 * Nombre de fautes de la page ouverte, dans la barre de statut (README §11).
 * Rien sans page ouverte ou sans correction prête. Un clic ouvre la liste des
 * fautes, pour les corriger d'affilée.
 */
export function SpellCounter() {
  const { fautes } = useMagasinDeCorrection();
  const [vue, definirVue] = useState<EditorView | null>(null);
  if (fautes === null) {
    return null;
  }
  const libelle = fautes === 0 ? 'Aucune faute' : fautes === 1 ? '1 faute' : `${fautes} fautes`;
  return (
    <>
      <button
        type="button"
        onClick={() => definirVue(vueDeLaPageOuverte())}
        aria-haspopup="dialog"
        title="Voir les fautes de la page"
        className="hover:bg-texte/10 focus-visible:bg-texte/20 flex items-center gap-1.5 rounded px-1.5 py-0.5 outline-0"
      >
        <SpellCheck className={`size-3.5 ${fautes === 0 ? 'text-succes' : 'text-erreur'}`} aria-hidden="true" />
        {libelle}
      </button>
      {vue !== null && <SpellcheckDialog vue={vue} surFermeture={() => definirVue(null)} />}
    </>
  );
}
