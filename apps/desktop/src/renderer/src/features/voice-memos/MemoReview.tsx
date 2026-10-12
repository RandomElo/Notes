import { Check, Circle, CircleCheck, Columns2, LoaderCircle, Mic, Rows2, TriangleAlert, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { MemoView } from '../../../../shared/memos-contract';
import { api } from '../../lib/ipc';
import { useStoredState } from '../../state/useStoredState';
import { AiComparison, estModeDeComparaison } from '../ai/AiComparison';
import type { ComparisonMode } from '../ai/AiComparison';
import { versWav16k } from './audio-convert';
import { dureesDesMemos, dureeTotale, libelleDeLaDuree, libelleDuRestant, restantDuMemo } from './memo-timing';
import type { MemoDurations, MemoStep } from './memo-timing';

const boutonSecondaire =
  'bg-texte/10 hover:bg-texte/20 focus-visible:bg-accent/40 inline-flex h-9 shrink-0 items-center gap-2 rounded-md px-4 text-sm font-medium outline-0 aria-disabled:opacity-60';
const boutonPrincipal =
  'bg-accent text-fond hover:bg-accent/85 focus-visible:bg-accent/75 inline-flex h-9 shrink-0 items-center gap-2 rounded-md px-4 text-sm font-semibold outline-0 aria-disabled:opacity-60';

type EtapeEnCours = MemoStep;
const libellesDesEtapes: Record<EtapeEnCours, string> = {
  lecture: 'Lecture de l’audio',
  transcription: 'Transcription',
  'mise-en-forme': 'Mise en forme',
};

type Etat =
  | {
      genre: 'encours';
      etape: EtapeEnCours;
      transcription: number | null;
      /** Début de l'étape, pour le temps restant. */
      depuis: number;
      /** Mise en forme estimée sur le texte réellement transcrit ; undefined avant la transcription. */
      miseEnFormeMs?: number | null;
    }
  | {
      genre: 'comparaison';
      brut: string;
      propre: string;
      /** Durées : audio, transcription. */
      duree: number;
      transcription: number;
      avertissements: string[];
      /** La mise en forme n'a pas pu se faire : on propose le texte brut. */
      sansMiseEnForme: string | null;
    }
  | { genre: 'erreur'; message: string };

const secondes = (ms: number): string => (ms < 100 ? 'moins de 0,1 s' : `${(Math.round(ms / 100) / 10).toString().replace('.', ',')} s`);

/** Le travail d'un mémo : audio converti, transcrit, mis en forme. */
async function traiter(memo: MemoView, surEtape: (etape: EtapeEnCours, transcription: number | null, miseEnFormeMs?: number | null) => void): Promise<Etat> {
  surEtape('lecture', null);
  const octets = await api.lireMemo({ chemin: memo.chemin });
  if (octets === null) {
    return { genre: 'erreur', message: 'Ce mémo n’est plus là.' };
  }
  let converti;
  try {
    converti = await versWav16k(octets);
  } catch {
    // Un format que Chromium ne lit pas (AMR, WMA, AIFF…) : le ffmpeg livré avec Notes le décode.
    const decode = await api.convertirMemo({ chemin: memo.chemin });
    if (!decode.ok) {
      return { genre: 'erreur', message: decode.message };
    }
    converti = decode;
  }
  surEtape('transcription', null);
  const transcription = await api.transcrireMemo({ wav: converti.wav });
  if (!transcription.ok) {
    return { genre: 'erreur', message: transcription.message };
  }
  if (transcription.texte.trim() === '') {
    return { genre: 'erreur', message: 'Rien n’a été entendu dans ce mémo.' };
  }
  // Le texte est là : la mise en forme s'estime maintenant sur sa vraie longueur.
  surEtape('mise-en-forme', transcription.dureeMs, await api.estimerMiseEnFormeMemo({ caracteres: transcription.texte.trim().length }).catch(() => null));
  const base = { genre: 'comparaison' as const, brut: transcription.texte, duree: converti.duree * 1000, transcription: transcription.dureeMs };
  const mise = await api.lancerIa({ fonction: 'memo', markdown: transcription.texte, titre: memo.titre });
  if (!mise.ok) {
    return { ...base, propre: transcription.texte, avertissements: [], sansMiseEnForme: mise.message };
  }
  return { ...base, propre: mise.markdown, avertissements: mise.avertissements, sansMiseEnForme: null };
}

/** « environ 40 s restantes », et pour « Tout transcrire » le temps de toute la série. */
function TempsRestant({ etat, durees, maintenant, suivants }: { etat: Extract<Etat, { genre: 'encours' }>; durees: MemoDurations[] | null; maintenant: number; suivants: number }) {
  const enCours = durees?.[0];
  if (enCours === undefined) {
    return null;
  }
  const restant = restantDuMemo({ ...enCours, miseEnFormeMs: etat.miseEnFormeMs === undefined ? enCours.miseEnFormeMs : etat.miseEnFormeMs }, etat.etape, maintenant - etat.depuis);
  if (restant === null) {
    return null;
  }
  const apres = suivants > 0 ? dureeTotale(durees!.slice(1)) : null;
  return (
    <p className="text-discret px-5 pb-3 text-sm">
      {libelleDuRestant(restant)}
      {apres !== null && ` · ${libelleDeLaDuree({ ms: restant.ms + apres.ms, complet: restant.complet && apres.complet })} pour les ${suivants + 1} mémos`}
    </p>
  );
}

interface MemoReviewProps {
  /** Mémos à traiter dans l'ordre : un seul, ou tous pour « Tout transcrire ». */
  file: MemoView[];
  surFermeture: () => void;
}

/**
 * Transcription d'un mémo (docs/spec/memos.md, choix d'Eloi du 2026-10-07) : d'un coup,
 * Whisper puis le modèle de mise en forme, puis la transcription brute face à
 * la mise en forme. Accepter crée la sous-page et met l'audio à la corbeille ;
 * rejeter laisse le mémo en attente.
 */
export function MemoReview({ file, surFermeture }: MemoReviewProps) {
  const [rang, definirRang] = useState(0);
  const [etat, definirEtat] = useState<Etat>(() => ({ genre: 'encours', etape: 'lecture', transcription: null, depuis: Date.now() }));
  /** Durées estimées du mémo en cours (le premier) et des suivants. */
  const [durees, definirDurees] = useState<MemoDurations[] | null>(null);
  const [maintenant, definirMaintenant] = useState(() => Date.now());
  const [mode, definirMode] = useStoredState<ComparisonMode>('notes.ia.comparaison', 'colonnes', estModeDeComparaison);
  const [enregistrement, definirEnregistrement] = useState<string | null>(null);
  const boutonAccepter = useRef<HTMLButtonElement>(null);
  const memo = file[rang];

  useEffect(() => {
    if (memo === undefined) {
      return;
    }
    let actif = true;
    definirEtat({ genre: 'encours', etape: 'lecture', transcription: null, depuis: Date.now() });
    definirEnregistrement(null);
    definirDurees(null);
    // Estimé à chaque mémo : le serveur de transcription a pu s'arrêter pendant la relecture du précédent.
    void api
      .estimerMemos({ chemins: file.slice(rang).map((suivant) => suivant.chemin) })
      .then((estimation) => actif && definirDurees(dureesDesMemos(estimation)))
      .catch(() => undefined);
    void traiter(memo, (etape, transcription, miseEnFormeMs) => actif && definirEtat({ genre: 'encours', etape, transcription, depuis: Date.now(), ...(miseEnFormeMs === undefined ? {} : { miseEnFormeMs }) })).then(
      (fin) => actif && definirEtat(fin),
    );
    return () => {
      actif = false;
    };
    // `file` ne change pas pendant la revue : le mémo suffit.
  }, [memo]);

  useEffect(() => {
    if (etat.genre !== 'encours') {
      return;
    }
    const minuteur = setInterval(() => definirMaintenant(Date.now()), 500);
    return () => clearInterval(minuteur);
  }, [etat.genre]);

  useEffect(() => {
    if (etat.genre === 'comparaison') {
      boutonAccepter.current?.focus();
    }
  }, [etat.genre]);

  const suivant = (): void => {
    if (rang + 1 < file.length) {
      definirRang(rang + 1);
    } else {
      surFermeture();
    }
  };

  // Échap : arrête la mise en forme en cours, sinon ferme. Un mémo non accepté reste en attente.
  useEffect(() => {
    const surTouche = (evenement: globalThis.KeyboardEvent): void => {
      if (evenement.key === 'Escape' && !evenement.defaultPrevented) {
        evenement.preventDefault();
        if (etat.genre === 'encours' && etat.etape === 'mise-en-forme') {
          void api.annulerIa();
        }
        surFermeture();
      }
    };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [etat, surFermeture]);

  if (memo === undefined) {
    return null;
  }

  const accepter = async (corps: string): Promise<void> => {
    definirEnregistrement('…');
    const resultat = await api.accepterMemo({ chemin: memo.chemin, corps });
    if (resultat.ok) {
      suivant();
    } else {
      definirEnregistrement(resultat.message);
    }
  };

  const large = etat.genre === 'comparaison';
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-[6vh] pb-[4vh]">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Transcription d’un mémo"
        className={`border-bordure bg-surface flex max-h-full w-full flex-col rounded-xl border shadow-2xl ${large ? 'h-full max-w-6xl' : 'max-w-lg'}`}
      >
        <div className="flex items-center gap-2.5 px-5 pt-4 pb-3">
          <Mic className="text-accent size-5 shrink-0" aria-hidden="true" />
          <h2 className="min-w-0 truncate text-base font-semibold">{memo.titre}</h2>
          {file.length > 1 && (
            <p className="text-discret shrink-0 text-sm">
              {rang + 1} sur {file.length}
            </p>
          )}
          {large && (
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

        {etat.genre === 'encours' && <TempsRestant etat={etat} durees={durees} maintenant={maintenant} suivants={file.length - rang - 1} />}

        {etat.genre === 'encours' && (
          <ol className="space-y-2 px-5 pb-4 text-sm" aria-live="polite">
            {(['lecture', 'transcription', 'mise-en-forme'] as const).map((etape, index) => {
              const position = ['lecture', 'transcription', 'mise-en-forme'].indexOf(etat.etape);
              const Icone = index < position ? CircleCheck : index === position ? LoaderCircle : Circle;
              return (
                <li key={etape} className={`flex items-center gap-2 ${index > position ? 'text-discret' : ''}`}>
                  <Icone className={`size-4 shrink-0 ${index < position ? 'text-succes' : index === position ? 'text-accent animate-spin' : ''}`} aria-hidden="true" />
                  {libellesDesEtapes[etape]}
                  {etape === 'transcription' && etat.transcription !== null && <span className="text-discret">en {secondes(etat.transcription)}</span>}
                </li>
              );
            })}
          </ol>
        )}

        {etat.genre === 'erreur' && (
          <p role="alert" className="text-erreur px-5 pb-4 text-sm">
            {etat.message}
          </p>
        )}

        {etat.genre === 'comparaison' && (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pb-4">
            {etat.sansMiseEnForme !== null && (
              <p role="alert" className="bg-alerte/15 flex items-start gap-2 rounded-md p-2 text-sm">
                <TriangleAlert className="text-alerte mt-0.5 size-4 shrink-0" aria-hidden="true" />
                Pas de mise en forme : {etat.sansMiseEnForme} La transcription brute peut quand même être gardée.
              </p>
            )}
            {etat.avertissements.map((avertissement) => (
              <p key={avertissement} role="alert" className="bg-alerte/15 flex items-start gap-2 rounded-md p-2 text-sm">
                <TriangleAlert className="text-alerte mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {avertissement}
              </p>
            ))}
            {etat.sansMiseEnForme === null ? (
              <AiComparison avant={etat.brut} apres={etat.propre} mode={mode} />
            ) : (
              <p className="bg-fond rounded-md p-3 text-sm whitespace-pre-wrap">{etat.brut}</p>
            )}
          </div>
        )}

        <div className="border-bordure flex flex-wrap items-center justify-end gap-3 border-t px-5 py-4">
          <div className="min-w-0 flex-1 text-xs">
            {etat.genre === 'comparaison' && (
              <p className="text-discret">
                {secondes(etat.duree)} d’audio, transcrites en {secondes(etat.transcription)}.
              </p>
            )}
            {enregistrement !== null && enregistrement !== '…' && (
              <p role="alert" className="text-erreur">
                {enregistrement}
              </p>
            )}
          </div>
          {etat.genre === 'comparaison' ? (
            <>
              <button type="button" onClick={suivant} className={boutonSecondaire}>
                <X className="size-4" aria-hidden="true" />
                {file.length > 1 && rang + 1 < file.length ? 'Rejeter, mémo suivant' : 'Rejeter'}
              </button>
              <button
                ref={boutonAccepter}
                type="button"
                aria-disabled={enregistrement === '…'}
                onClick={() => enregistrement !== '…' && void accepter(etat.propre)}
                className={boutonPrincipal}
              >
                <Check className="size-4" aria-hidden="true" />
                {etat.sansMiseEnForme === null ? 'Accepter' : 'Garder la transcription brute'}
              </button>
            </>
          ) : etat.genre === 'erreur' ? (
            <>
              <button type="button" onClick={surFermeture} className={boutonSecondaire}>
                Fermer
              </button>
              {file.length > 1 && rang + 1 < file.length && (
                <button type="button" autoFocus onClick={suivant} className={boutonPrincipal}>
                  Mémo suivant
                </button>
              )}
            </>
          ) : (
            <button type="button" autoFocus onClick={surFermeture} className={boutonSecondaire}>
              <X className="size-4" aria-hidden="true" />
              Arrêter
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
