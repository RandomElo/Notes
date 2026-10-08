import { AudioLines, Download, FolderOpen, LoaderCircle, Mic, Play, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import type { MemosState, MemoView } from '../../../../shared/memos-contract';
import { api } from '../../lib/ipc';
import { MemoPlayer } from './MemoPlayer';
import { MemoReview } from './MemoReview';

const boutonSecondaire =
  'bg-texte/10 hover:bg-texte/20 focus-visible:bg-accent/40 inline-flex h-8 shrink-0 items-center gap-2 rounded-md px-3 text-sm leading-none font-medium outline-0 aria-disabled:opacity-50';
const boutonPrincipal =
  'bg-accent text-fond hover:brightness-110 focus-visible:brightness-125 inline-flex h-8 shrink-0 items-center gap-2 rounded-md px-3 text-sm leading-none font-medium outline-0 aria-disabled:opacity-50';
const boutonIcone = 'text-discret hover:bg-texte/10 hover:text-texte focus-visible:bg-texte/20 focus-visible:text-texte flex size-8 shrink-0 items-center justify-center rounded outline-0';

const taille = (octets: number): string =>
  octets >= 1024 ** 2 ? `${(Math.round((octets / 1024 ** 2) * 10) / 10).toString().replace('.', ',')} Mo` : `${Math.max(1, Math.round(octets / 1024))} Ko`;

/** Ce qu'il faut à la transcription : le modèle, téléchargé une fois. */
function Transcription({ whisper }: { whisper: MemosState['whisper'] }) {
  if (!whisper.binaire) {
    return (
      <p role="alert" className="text-erreur text-sm">
        Le serveur de transcription manque à cette version de Notes.
      </p>
    );
  }
  if (whisper.modele === 'pret') {
    return whisper.carte === null ? <p className="text-discret text-xs">Pas de carte graphique dédiée : la transcription se fait sur le processeur, plus lentement.</p> : null;
  }
  if (whisper.modele === 'telechargement') {
    const part = whisper.total === 0 ? 0 : whisper.recus / whisper.total;
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-sm">
          <LoaderCircle className="text-accent size-4 animate-spin" aria-hidden="true" />
          Téléchargement du modèle de transcription : {Math.round(part * 100)} %
          <button type="button" onClick={() => void api.annulerInstallationWhisper()} className={`${boutonSecondaire} ml-auto`}>
            <X className="size-4" aria-hidden="true" />
            Annuler
          </button>
        </div>
        <div className="bg-texte/10 h-1.5 overflow-hidden rounded-full" role="progressbar" aria-label="Modèle de transcription" aria-valuenow={Math.round(part * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="bg-accent h-full rounded-full transition-[width]" style={{ width: `${part * 100}%` }} />
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <p>
        La transcription a besoin d’un modèle (574 Mo), téléchargé une fois dans <span className="font-mono text-xs">{whisper.dossier}</span>.
        {whisper.erreur !== null && <span className="text-erreur"> {whisper.erreur}</span>}
      </p>
      <button type="button" onClick={() => void api.installerModeleWhisper()} className={boutonPrincipal}>
        <Download className="size-4" aria-hidden="true" />
        Télécharger le modèle
      </button>
    </div>
  );
}

/** Une ligne : le mémo, l'écoute à la demande, transcrire, corbeille. */
function Ligne({ memo, pret, surTranscription, surEcart }: { memo: MemoView; pret: boolean; surTranscription: () => void; surEcart: () => void }) {
  const [octets, definirOctets] = useState<Uint8Array | null>(null);
  return (
    <li className="space-y-1.5 py-2">
      <div className="flex items-center gap-2">
        <AudioLines className="text-discret size-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-sm">{memo.titre}</span>
        <span className="text-discret shrink-0 text-xs">{taille(memo.taille)}</span>
        {octets === null && (
          <button
            type="button"
            title="Écouter"
            aria-label={`Écouter ${memo.titre}`}
            onClick={() => void api.lireMemo({ chemin: memo.chemin }).then((lus) => lus !== null && definirOctets(lus))}
            className={boutonIcone}
          >
            <Play className="size-4" aria-hidden="true" />
          </button>
        )}
        <button type="button" aria-disabled={!pret} onClick={() => pret && surTranscription()} className={boutonSecondaire}>
          Transcrire
        </button>
        <button type="button" title="Mettre à la corbeille sans transcrire" aria-label={`Mettre ${memo.titre} à la corbeille`} onClick={surEcart} className={boutonIcone}>
          <Trash2 className="size-4" aria-hidden="true" />
        </button>
      </div>
      {octets !== null && (
        <div className="pl-6">
          <MemoPlayer
            octets={octets}
            nom={memo.nom}
            libelle={`Écouter ${memo.titre}`}
            enWav={() => api.convertirMemo({ chemin: memo.chemin }).then((decode) => (decode.ok ? decode.wav : null))}
          />
        </div>
      )}
    </li>
  );
}

/**
 * En tête de la page « Mémos vocaux » (README §13) : les mémos en attente,
 * à écouter, transcrire un par un ou tous d'affilée, ou mettre à la corbeille.
 */
export function MemoList({ etat, surEtat }: { etat: MemosState; surEtat: (etat: MemosState) => void }) {
  const [revue, definirRevue] = useState<MemoView[] | null>(null);
  const [erreurDuDossier, definirErreurDuDossier] = useState<string | null>(null);
  const pret = etat.whisper.binaire && etat.whisper.modele === 'pret';
  return (
    <section aria-label="Mémos en attente" className="bg-surface mb-6 space-y-3 rounded-lg p-4">
      <div className="flex items-center gap-2">
        <Mic className="text-accent size-4 shrink-0" aria-hidden="true" />
        <h2 className="flex-1 text-sm font-medium">
          {etat.memos.length === 0 ? 'Aucun mémo en attente' : etat.memos.length === 1 ? 'Un mémo en attente' : `${etat.memos.length} mémos en attente`}
        </h2>
        <button
          type="button"
          title="Ouvrir le dossier où arrivent les mémos"
          aria-label="Ouvrir le dossier des mémos"
          onClick={() => void api.ouvrirDossierMemos().then((resultat) => definirErreurDuDossier(resultat.ok ? null : resultat.message))}
          className={boutonIcone}
        >
          <FolderOpen className="size-4" aria-hidden="true" />
        </button>
        {etat.memos.length > 1 && (
          <button type="button" aria-disabled={!pret} onClick={() => pret && definirRevue(etat.memos)} className={boutonPrincipal}>
            Tout transcrire
          </button>
        )}
      </div>
      {erreurDuDossier !== null && (
        <p role="alert" className="text-erreur text-xs">
          {erreurDuDossier}
        </p>
      )}
      {etat.memos.length === 0 ? (
        <p className="text-discret text-xs">Les mémos enregistrés sur le téléphone arrivent ici par la synchronisation. Un fichier audio déposé dans le dossier des mémos (l’icône de dossier) arrive aussi. Chacun, transcrit, devient une sous-page.</p>
      ) : (
        <ul className="divide-bordure divide-y">
          {etat.memos.map((memo) => (
            <Ligne key={memo.chemin} memo={memo} pret={pret} surTranscription={() => definirRevue([memo])} surEcart={() => void api.ecarterMemo({ chemin: memo.chemin }).then(surEtat)} />
          ))}
        </ul>
      )}
      <Transcription whisper={etat.whisper} />
      {revue !== null && <MemoReview file={revue} surFermeture={() => definirRevue(null)} />}
    </section>
  );
}
