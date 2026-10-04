import { Check, CircleDashed, Download, LoaderCircle, RotateCcw, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import type { SpellcheckState, SpellcheckStep } from '../../../../shared/ipc-contract';
import { api } from '../../lib/ipc';
import { avancement, libelleDEtape, taille } from './spellcheck-labels';
import { magasinDeCorrection, useMagasinDeCorrection } from './spellcheck-store';

const boutonSecondaire = 'bg-texte/10 hover:bg-texte/20 focus-visible:bg-accent/40 inline-flex h-8 shrink-0 items-center gap-2 rounded-md px-3 leading-none font-medium outline-0';
const boutonPrincipal = 'bg-accent text-fond hover:brightness-110 focus-visible:brightness-125 inline-flex h-8 shrink-0 items-center gap-2 rounded-md px-3 leading-none font-medium outline-0';

type EtatDUneLigne = SpellcheckStep['etat'];

function IconeDEtat({ etat }: { etat: EtatDUneLigne }) {
  switch (etat) {
    case 'fait':
      return <Check className="text-succes size-4 shrink-0" aria-hidden="true" />;
    case 'en_cours':
      return <LoaderCircle className="text-accent size-4 shrink-0 animate-spin" aria-hidden="true" />;
    case 'echec':
      return <X className="text-erreur size-4 shrink-0" aria-hidden="true" />;
    default:
      return <CircleDashed className="text-discret size-4 shrink-0" aria-hidden="true" />;
  }
}

/** Une ligne de la liste des étapes : icône, nom, où elle en est, et sa barre. */
function Ligne({ etat, libelle, detail, part }: { etat: EtatDUneLigne; libelle: string; detail: string; part: number | null }) {
  return (
    <li className="space-y-1.5">
      <div className="flex items-center gap-2">
        <IconeDEtat etat={etat} />
        <span className={etat === 'a_faire' ? 'text-discret' : ''}>{libelle}</span>
        <span className="text-discret ml-auto text-xs">{detail}</span>
      </div>
      {part !== null && (
        <div className="bg-texte/10 ml-6 h-1.5 overflow-hidden rounded-full" role="progressbar" aria-label={libelle} aria-valuenow={Math.round(part * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="bg-accent h-full rounded-full transition-[width]" style={{ width: `${part * 100}%` }} />
        </div>
      )}
    </li>
  );
}

/** Les étapes de l'installation, et le démarrage du serveur qui la termine. */
function Etapes({ etat }: { etat: SpellcheckState }) {
  const demarrage: EtatDUneLigne =
    etat.installation !== 'installee' ? 'a_faire' : etat.serveur === 'erreur' ? 'echec' : etat.serveur === 'pret' ? 'fait' : 'en_cours';
  return (
    <ol className="space-y-3">
      {etat.etapes.map((etape) => (
        <Ligne key={etape.id} etat={etape.etat} libelle={etape.libelle} detail={libelleDEtape(etape)} part={etape.etat === 'en_cours' ? avancement(etape) : null} />
      ))}
      <Ligne etat={demarrage} libelle="Démarrage de LanguageTool" detail={demarrage === 'en_cours' ? 'Chargement du français' : ''} part={null} />
    </ol>
  );
}

/**
 * Correction orthographique dans les réglages (README §11) : installer
 * LanguageTool d'un clic, suivre les étapes, puis voir s'il tourne. Notes le
 * lance elle-même à chaque ouverture.
 */
export function SpellcheckPanel() {
  const { etat } = useMagasinDeCorrection();
  const [confirmation, definirConfirmation] = useState(false);
  if (etat === null) {
    return null;
  }
  const mettreAJour = (promesse: Promise<SpellcheckState>): void => {
    void promesse.then(magasinDeCorrection.definirEtat);
  };
  const etapesVisibles = etat.etapes.length > 0;

  return (
    <section aria-labelledby="titre-correction" className="space-y-4">
      <div>
        <h2 id="titre-correction" className="text-xl font-semibold">
          Correction orthographique
        </h2>
        <p className="text-discret mt-1 text-sm">
          Les fautes sont soulignées pendant qu'on écrit : en rouge l'orthographe, en bleu la grammaire et le style. Un clic sur un mot souligné propose la correction.
          Tout se passe sur ce poste, avec LanguageTool, que Notes installe et lance elle-même.
        </p>
      </div>

      <div className="bg-surface space-y-4 rounded-lg p-4 text-sm">
        {etapesVisibles && <Etapes etat={etat} />}

        {etat.installation === 'absente' && (
          <>
            {!etapesVisibles && (
              <p>
                LanguageTool n'est pas installé. L'installation télécharge {taille(etat.taille)} (Java, LanguageTool et les données qui aident à repérer les mots
                confondus), et prend environ 4 Go dans <span className="font-mono text-xs">{etat.dossier}</span>.
              </p>
            )}
            {etat.erreur !== null && (
              <p role="alert" className="text-erreur">
                {etat.erreur}
              </p>
            )}
            <div className="flex justify-end">
              <button type="button" onClick={() => mettreAJour(api.installerCorrection())} className={boutonPrincipal}>
                <Download className="size-4" aria-hidden="true" />
                {etat.erreur === null ? 'Installer la correction orthographique' : "Réessayer l'installation"}
              </button>
            </div>
          </>
        )}

        {etat.installation === 'en_cours' && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-discret text-xs">On peut continuer à écrire pendant l'installation.</p>
            <button type="button" onClick={() => void api.annulerInstallationCorrection()} className={boutonSecondaire}>
              <X className="size-4" aria-hidden="true" />
              Annuler
            </button>
          </div>
        )}

        {etat.installation === 'installee' && (
          <>
            <p role="status">
              {etat.serveur === 'pret'
                ? 'La correction est active.'
                : etat.serveur === 'demarrage'
                  ? 'LanguageTool démarre…'
                  : etat.serveur === 'erreur'
                    ? `La correction est en pause : ${etat.erreur ?? "LanguageTool s'est arrêté."}`
                    : 'LanguageTool est arrêté.'}
            </p>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-discret text-xs">
                Installé dans <span className="font-mono">{etat.dossier}</span>
              </p>
              <div className="flex gap-2">
                {etat.serveur === 'erreur' && (
                  <button type="button" onClick={() => mettreAJour(api.relancerCorrection())} className={boutonSecondaire}>
                    <RotateCcw className="size-4" aria-hidden="true" />
                    Relancer
                  </button>
                )}
                {confirmation ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        definirConfirmation(false);
                        mettreAJour(api.desinstallerCorrection());
                      }}
                      className="bg-erreur/25 hover:bg-erreur/40 focus-visible:bg-erreur/50 inline-flex h-8 items-center gap-2 rounded-md px-3 leading-none font-medium outline-0"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                      Supprimer LanguageTool
                    </button>
                    <button type="button" onClick={() => definirConfirmation(false)} className={boutonSecondaire}>
                      Garder
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={() => definirConfirmation(true)} className={boutonSecondaire}>
                    <Trash2 className="size-4" aria-hidden="true" />
                    Désinstaller
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
