import { Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../../lib/ipc';
import { libelleDeDollars } from './ai-labels';

/**
 * Dépense IA du jour dans la barre de statut (README §7, §12). Elle n'apparaît
 * que si une fonction passe par LiteLLM (choix d'Eloi, 2026-10-05) : un modèle
 * local ne coûte rien. Un clic ouvre l'historique.
 */
export function AiSpend({ surOuverture }: { surOuverture: () => void }) {
  const [depense, definirDepense] = useState<{ jour: number; mois: number; seuil: number | null; visible: boolean } | null>(null);

  useEffect(() => {
    const lire = (): void =>
      void api.historiqueIa().then((vue) => definirDepense({ jour: vue.depenseDuJourUsd, mois: vue.depenseDuMoisUsd, seuil: vue.seuilMensuelUsd, visible: vue.litellmChoisi }));
    lire();
    const desabonner = api.surHistoriqueIa(lire);
    // Le jour change à minuit ; le dossier des notes peut aussi recevoir des appels d'un autre poste.
    const minuteur = setInterval(lire, 10 * 60_000);
    return () => {
      desabonner();
      clearInterval(minuteur);
    };
  }, []);

  if (depense === null || !depense.visible) {
    return null;
  }
  const depasse = depense.seuil !== null && depense.mois > depense.seuil;
  return (
    <button
      type="button"
      onClick={surOuverture}
      title={`IA : ${libelleDeDollars(depense.mois)} ce mois-ci${depasse ? `, au-delà de l'alerte de ${libelleDeDollars(depense.seuil!)}` : ''}`}
      className="hover:bg-texte/10 focus-visible:bg-texte/20 flex items-center gap-1.5 rounded px-1.5 py-0.5 outline-0"
    >
      <Sparkles className={`size-3.5 ${depasse ? 'text-alerte' : ''}`} aria-hidden="true" />
      IA aujourd’hui : {libelleDeDollars(depense.jour)}
    </button>
  );
}
