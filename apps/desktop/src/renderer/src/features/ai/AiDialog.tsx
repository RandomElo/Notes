import type { AiPageFunction } from '@notes/core';
import { Check, ClipboardCopy, Columns2, LoaderCircle, Rows2, Sparkles, TriangleAlert, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { libellesDesFonctions } from '../../../../shared/ai-contract';
import type { AiEstimateResult, AiRunResult } from '../../../../shared/ai-contract';
import { api } from '../../lib/ipc';
import { useStoredState } from '../../state/useStoredState';
import { AiComparison, estModeDeComparaison } from './AiComparison';
import type { ComparisonMode } from './AiComparison';
import { libelleDEcart, libelleDeDuree, libelleDeTempsRestant, libelleDeTokens, tempsRestantDeLIa } from './ai-labels';

const boutonSecondaire =
  'bg-texte/10 hover:bg-texte/20 focus-visible:bg-accent/40 inline-flex h-9 shrink-0 items-center gap-2 rounded-md px-4 text-sm font-medium outline-0';
const boutonPrincipal =
  'bg-accent text-fond hover:bg-accent/85 focus-visible:bg-accent/75 inline-flex h-9 shrink-0 items-center gap-2 rounded-md px-4 text-sm font-semibold outline-0 aria-disabled:opacity-60';

const descriptions: Record<Exclude<AiPageFunction, 'memo'>, string> = {
  relecture: 'Améliore la fluidité et la formulation, corrige les fautes, sans changer la structure ni le sens.',
  'mise-au-propre': 'Transforme des notes en vrac en document structuré et rédigé. Ce n’est pas un résumé : rien n’est retiré.',
};

const estFonction = (valeur: unknown): valeur is Exclude<AiPageFunction, 'memo'> => valeur === 'relecture' || valeur === 'mise-au-propre';

type Etape =
  | { genre: 'choix' }
  | { genre: 'encours'; envoye: string; debut: number }
  | { genre: 'comparaison'; envoye: string; resultat: Extract<AiRunResult, { ok: true }> }
  | { genre: 'erreur'; message: string };

interface AiDialogProps {
  titre: string;
  /** Corps de la page tel qu'il est dans l'éditeur, en Markdown. */
  lireCorps: () => string;
  /** Remplace le contenu de la page par la proposition (annulable par Ctrl+Z). */
  surAcceptation: (markdown: string) => void;
  surFermeture: () => void;
}

/** Ce qu'on sait de l'appel avant de le lancer : modèle, tailles, durée. */
function Estimation({ estimation }: { estimation: AiEstimateResult | null }) {
  if (estimation === null) {
    return (
      <p className="text-discret flex items-center gap-2 text-sm">
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        Estimation…
      </p>
    );
  }
  if (!estimation.ok) {
    return (
      <p role="alert" className="text-erreur text-sm">
        {estimation.message}
      </p>
    );
  }
  const lignes: Array<[string, string]> = [
    ['Modèle', `${estimation.modele} (${estimation.automatique ? 'sur ce poste, choisi par Notes' : 'sur ce poste'})`],
    ['Envoyé', libelleDeTokens(estimation.entree)],
    ['Réponse attendue', `${libelleDeTokens(estimation.sortie)}${estimation.appelsConnus === 0 ? ', estimée sans historique' : ''}`],
    ['Durée', estimation.dureeMs === null ? 'inconnue avant un premier essai de ce modèle' : libelleDeDuree(estimation.dureeMs)],
  ];
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      {lignes.map(([terme, valeur]) => (
        <div key={terme} className="contents">
          <dt className="text-discret">{terme}</dt>
          <dd className="min-w-0 break-words">{valeur}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Le réel face à l'estimé, sous la comparaison. */
function Bilan({ resultat }: { resultat: Extract<AiRunResult, { ok: true }> }) {
  const { appel } = resultat;
  const morceaux = [
    `${libelleDeTokens(appel.entree)} envoyés (${libelleDEcart(appel.entree, appel.estimation.entree)})`,
    `${libelleDeTokens(appel.sortie)} reçus (${libelleDEcart(appel.sortie, appel.estimation.sortie)})`,
    `en ${libelleDeDuree(appel.dureeMs).replace('environ ', '')}`,
  ];
  return <p className="text-discret text-xs">{morceaux.join(', ')}.</p>;
}

/**
 * Fonctions IA d'une page (README §12) : choix de la fonction et estimation,
 * appel annulable, puis comparaison avant/après. Rien ne change dans la page
 * tant que la proposition n'est pas acceptée.
 */
export function AiDialog({ titre, lireCorps, surAcceptation, surFermeture }: AiDialogProps) {
  const [fonction, definirFonction] = useStoredState<Exclude<AiPageFunction, 'memo'>>('notes.ia.fonction', 'relecture', estFonction);
  const [mode, definirMode] = useStoredState<ComparisonMode>('notes.ia.comparaison', 'colonnes', estModeDeComparaison);
  const [estimation, definirEstimation] = useState<AiEstimateResult | null>(null);
  const [etape, definirEtape] = useState<Etape>({ genre: 'choix' });
  const [recu, definirRecu] = useState({ texte: '', sortie: 0 });
  const [maintenant, definirMaintenant] = useState(() => Date.now());
  const [refus, definirRefus] = useState<string | null>(null);
  // Résultat de « Copier le prompt » : null tant qu'on n'a pas copié.
  const [copie, definirCopie] = useState<{ ok: boolean; message: string } | null>(null);
  const boutonLancer = useRef<HTMLButtonElement>(null);
  const boutonAccepter = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (etape.genre !== 'choix') {
      return;
    }
    let actif = true;
    definirEstimation(null);
    void api.estimerIa({ fonction, markdown: lireCorps(), titre }).then((resultat) => actif && definirEstimation(resultat));
    return () => {
      actif = false;
    };
  }, [fonction, etape.genre, lireCorps, titre]);

  useEffect(() => api.surAvancementIa((avancement) => definirRecu(avancement)), []);

  useEffect(() => {
    if (etape.genre !== 'encours') {
      return;
    }
    const minuteur = setInterval(() => definirMaintenant(Date.now()), 500);
    return () => clearInterval(minuteur);
  }, [etape.genre]);

  useEffect(() => {
    if (etape.genre === 'comparaison') {
      boutonAccepter.current?.focus();
    }
  }, [etape.genre]);

  // Échap : annule l'appel en cours, sinon ferme. La proposition non acceptée est perdue, la page n'a pas changé.
  useEffect(() => {
    const surTouche = (evenement: globalThis.KeyboardEvent): void => {
      if (evenement.key === 'Escape' && !evenement.defaultPrevented) {
        evenement.preventDefault();
        if (etape.genre === 'encours') {
          void api.annulerIa();
        } else {
          surFermeture();
        }
      }
    };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [etape.genre, surFermeture]);

  const lancer = async (): Promise<void> => {
    if (estimation === null || !estimation.ok) {
      return;
    }
    const envoye = lireCorps();
    definirRecu({ texte: '', sortie: 0 });
    definirEtape({ genre: 'encours', envoye, debut: Date.now() });
    const resultat = await api.lancerIa({ fonction, markdown: envoye, titre });
    if (resultat.ok) {
      definirEtape({ genre: 'comparaison', envoye, resultat });
    } else if (resultat.annule) {
      definirEtape({ genre: 'choix' });
    } else {
      definirEtape({ genre: 'erreur', message: resultat.message });
    }
  };

  // Pour un autre outil (un assistant en ligne) : la consigne de la fonction, puis le texte de la page.
  const copier = async (): Promise<void> => {
    const resultat = await api.consigneIa({ fonction, markdown: lireCorps(), titre });
    if (!resultat.ok) {
      definirCopie({ ok: false, message: resultat.message });
      return;
    }
    try {
      await navigator.clipboard.writeText(resultat.texte);
      definirCopie({ ok: true, message: 'Prompt copié : colle-le dans l’outil de ton choix.' });
    } catch {
      definirCopie({ ok: false, message: 'Le presse-papiers n’est pas accessible.' });
    }
  };

  const accepter = (): void => {
    if (etape.genre !== 'comparaison') {
      return;
    }
    // La page a changé pendant l'appel (synchronisation) : la proposition ne s'applique plus à elle.
    if (lireCorps() !== etape.envoye) {
      definirRefus('La page a changé depuis l’envoi : la proposition ne peut plus être appliquée. Relance la fonction.');
      return;
    }
    surAcceptation(etape.resultat.markdown);
    surFermeture();
  };

  const large = etape.genre === 'comparaison';
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-[6vh] pb-[4vh]" onMouseDown={etape.genre === 'encours' ? undefined : surFermeture}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Fonctions IA de la page"
        className={`border-bordure bg-surface flex max-h-full w-full flex-col rounded-xl border shadow-2xl ${large ? 'h-full max-w-6xl' : 'max-w-lg'}`}
        onMouseDown={(evenement) => evenement.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 px-5 pt-4 pb-3">
          <Sparkles className="text-accent size-5 shrink-0" aria-hidden="true" />
          <h2 className="shrink-0 text-base font-semibold">{etape.genre === 'comparaison' ? libellesDesFonctions[fonction] : 'Fonctions IA'}</h2>
          <p className="text-discret min-w-0 truncate text-sm">{titre}</p>
          {etape.genre === 'comparaison' && (
            <div className="ml-auto flex shrink-0 gap-1" role="group" aria-label="Disposition de la comparaison">
              {(
                [
                  ['colonnes', 'Deux colonnes', Columns2],
                  ['unifie', 'Une colonne', Rows2],
                ] as const
              ).map(([cle, libelle, Icone]) => (
                <button
                  key={cle}
                  type="button"
                  aria-pressed={mode === cle}
                  onClick={() => definirMode(cle)}
                  className={`flex h-7 items-center gap-1.5 rounded px-2 text-xs outline-0 ${mode === cle ? 'bg-accent/25 text-texte' : 'text-discret hover:bg-texte/10 focus-visible:bg-texte/20'}`}
                >
                  <Icone className="size-3.5" aria-hidden="true" />
                  {libelle}
                </button>
              ))}
            </div>
          )}
        </div>

        {etape.genre === 'choix' && (
          <div className="flex flex-col gap-4 px-5 pb-4">
            <div role="radiogroup" aria-label="Fonction" className="flex flex-col gap-1">
              {(['relecture', 'mise-au-propre'] as const).map((cle) => (
                <button
                  key={cle}
                  type="button"
                  role="radio"
                  aria-checked={fonction === cle}
                  onClick={() => {
                    definirFonction(cle);
                    definirCopie(null);
                  }}
                  onKeyDown={(evenement) => {
                    if (evenement.key === 'ArrowDown' || evenement.key === 'ArrowUp') {
                      evenement.preventDefault();
                      definirFonction(fonction === 'relecture' ? 'mise-au-propre' : 'relecture');
                      (evenement.currentTarget.parentElement?.querySelector(`[data-fonction="${fonction === 'relecture' ? 'mise-au-propre' : 'relecture'}"]`) as HTMLElement | null)?.focus();
                    } else if (evenement.key === 'Enter') {
                      evenement.preventDefault();
                      boutonLancer.current?.click();
                    }
                  }}
                  data-fonction={cle}
                  tabIndex={fonction === cle ? 0 : -1}
                  autoFocus={fonction === cle}
                  className={`flex flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left outline-0 ${fonction === cle ? 'bg-accent/20 focus-visible:bg-accent/35' : 'hover:bg-texte/10 focus-visible:bg-texte/20'}`}
                >
                  <span className="text-sm font-medium">{libellesDesFonctions[cle]}</span>
                  <span className="text-discret text-xs">{descriptions[cle]}</span>
                </button>
              ))}
            </div>
            <Estimation estimation={estimation} />
          </div>
        )}

        {etape.genre === 'encours' && (
          <div className="flex flex-col gap-3 px-5 pb-4" aria-live="polite">
            <p className="flex items-center gap-2 text-sm">
              <LoaderCircle className="text-accent size-4 animate-spin" aria-hidden="true" />
              {recu.texte === '' ? 'En attente du modèle…' : `Environ ${libelleDeTokens(recu.sortie)} reçus`}
              <span className="text-discret">
                ·{' '}
                {estimation?.ok === true && estimation.dureeMs !== null
                  ? libelleDeTempsRestant(tempsRestantDeLIa(estimation.dureeMs, maintenant - etape.debut, recu.sortie, estimation.sortie))
                  : `${Math.max(0, Math.round((maintenant - etape.debut) / 1000))} s`}
              </span>
            </p>
            {estimation?.ok === true && (
              <div className="bg-texte/10 h-1.5 overflow-hidden rounded-full" role="progressbar" aria-label="Réponse reçue" aria-valuenow={Math.min(100, Math.round((recu.sortie / Math.max(1, estimation.sortie)) * 100))} aria-valuemin={0} aria-valuemax={100}>
                <div className="bg-accent h-full rounded-full transition-[width]" style={{ width: `${Math.min(100, (recu.sortie / Math.max(1, estimation.sortie)) * 100)}%` }} />
              </div>
            )}
            <pre className="bg-fond text-discret max-h-40 overflow-hidden rounded-md p-2 font-mono text-xs whitespace-pre-wrap">{recu.texte.slice(-600)}</pre>
          </div>
        )}

        {etape.genre === 'erreur' && (
          <p role="alert" className="text-erreur px-5 pb-4 text-sm">
            {etape.message}
          </p>
        )}

        {etape.genre === 'comparaison' && (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pb-4">
            {etape.resultat.avertissements.map((avertissement) => (
              <p key={avertissement} role="alert" className="bg-alerte/15 flex items-start gap-2 rounded-md p-2 text-sm">
                <TriangleAlert className="text-alerte mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {avertissement}
              </p>
            ))}
            <AiComparison avant={etape.envoye} apres={etape.resultat.markdown} mode={mode} />
          </div>
        )}

        <div className="border-bordure flex flex-wrap items-center justify-end gap-3 border-t px-5 py-4">
          <div className="min-w-0 flex-1">
            {etape.genre === 'comparaison' && <Bilan resultat={etape.resultat} />}
            {refus !== null && (
              <p role="alert" className="text-erreur text-sm">
                {refus}
              </p>
            )}
            {copie !== null && (etape.genre === 'choix' || etape.genre === 'erreur') && (
              <p role="status" className={`text-sm ${copie.ok ? 'text-discret' : 'text-erreur'}`}>
                {copie.message}
              </p>
            )}
          </div>
          {(etape.genre === 'choix' || etape.genre === 'erreur') && (
            <button
              type="button"
              onClick={() => void copier()}
              title="Copier la consigne de la fonction suivie du texte de la page, pour les coller dans un autre outil"
              className={boutonSecondaire}
            >
              <ClipboardCopy className="size-4" aria-hidden="true" />
              Copier le prompt
            </button>
          )}
          {etape.genre === 'choix' && (
            <>
              <button type="button" onClick={surFermeture} className={boutonSecondaire}>
                Fermer
              </button>
              <button
                ref={boutonLancer}
                type="button"
                aria-disabled={estimation === null || !estimation.ok}
                onClick={() => void lancer()}
                className={boutonPrincipal}
              >
                <Sparkles className="size-4" aria-hidden="true" />
                Lancer
              </button>
            </>
          )}
          {etape.genre === 'encours' && (
            <button type="button" autoFocus onClick={() => void api.annulerIa()} className={boutonSecondaire}>
              <X className="size-4" aria-hidden="true" />
              Annuler
            </button>
          )}
          {etape.genre === 'erreur' && (
            <button type="button" autoFocus onClick={() => definirEtape({ genre: 'choix' })} className={boutonSecondaire}>
              Retour
            </button>
          )}
          {etape.genre === 'comparaison' && (
            <>
              <button type="button" onClick={surFermeture} className={boutonSecondaire}>
                <X className="size-4" aria-hidden="true" />
                Rejeter
              </button>
              <button ref={boutonAccepter} type="button" aria-disabled={refus !== null} onClick={accepter} className={boutonPrincipal}>
                <Check className="size-4" aria-hidden="true" />
                Accepter
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
