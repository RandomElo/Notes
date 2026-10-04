import type { BackgroundState } from '../../../../shared/ipc-contract';
import { Power } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../../lib/ipc';

/**
 * Recherche globale (README §7) : Notes reste lancée en fond une fois sa
 * fenêtre fermée, la recherche prête, et capte elle-même le raccourci. On
 * règle ici le démarrage avec la session, et on la quitte pour de bon.
 */
export function GlobalShortcutPanel() {
  const [etat, definirEtat] = useState<BackgroundState | null>(null);
  const [erreur, definirErreur] = useState<string | null>(null);

  useEffect(() => {
    void api.etatDuFond().then(definirEtat);
  }, []);

  const basculer = (actif: boolean): void => {
    definirErreur(null);
    void api.definirDemarrageAuto(actif).then(
      (nouvel) => {
        definirEtat(nouvel);
        if (nouvel.demarrageAuto !== actif) {
          definirErreur("Le réglage n'a pas pu être enregistré.");
        }
      },
      () => definirErreur("Le réglage n'a pas pu être enregistré."),
    );
  };

  return (
    <section aria-labelledby="titre-raccourci" className="space-y-4">
      <div>
        <h2 id="titre-raccourci" className="text-xl font-semibold">
          Recherche globale
        </h2>
        <p className="text-discret mt-1 text-sm">
          {etat?.raccourci ?? 'Ctrl+Alt+Espace'} ouvre la recherche de n'importe où, aussitôt. Pour cela, Notes reste lancée quand on ferme sa fenêtre, la
          recherche prête et cachée, et la synchronisation en pause.
        </p>
      </div>
      {etat !== null && (
        <div className="bg-surface space-y-4 rounded-lg p-4 text-sm">
          <p role="status">
            {etat.raccourciActif
              ? `${etat.raccourci} est actif.`
              : `${etat.raccourci} est déjà pris par un autre programme, sans doute un raccourci personnalisé de Cinnamon : le retirer, puis relancer Notes.`}
          </p>

          {etat.demarrageAuto === null ? (
            <p className="text-discret">Le démarrage avec la session se règle dans l'AppImage. En développement, il n'y a rien à régler ici.</p>
          ) : (
            <label className="flex cursor-pointer items-start gap-3">
              <input type="checkbox" checked={etat.demarrageAuto} onChange={(evenement) => basculer(evenement.target.checked)} className="accent-accent mt-0.5 size-4" />
              <span>
                Démarrer Notes avec la session
                <span className="text-discret block text-xs">Sans fenêtre : la recherche est prête dès l'ouverture de session.</span>
              </span>
            </label>
          )}
          {erreur !== null && (
            <p role="alert" className="text-erreur">
              {erreur}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-discret text-xs">Quitter arrête Notes complètement : le raccourci ne marche plus jusqu'au prochain lancement.</p>
            <button
              type="button"
              onClick={() => void api.quitterNotes()}
              className="bg-texte/10 hover:bg-texte/20 focus-visible:bg-accent/40 inline-flex h-8 shrink-0 items-center gap-2 rounded-md px-3 leading-none font-medium outline-0"
            >
              <Power className="size-4" aria-hidden="true" />
              Quitter Notes (Ctrl+Q)
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
