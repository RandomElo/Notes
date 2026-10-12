import { LoaderCircle, Mic, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ActionDeFeuille, Sheet } from '../../components/Sheet';
import { libelleDuMemo, tailleLisible, titreDeLAttente } from './memo-labels';
import { useMemos } from './MemosContext';

/**
 * Sur l'accueil, les mémos enregistrés qui ne sont pas encore sur le NAS
 * (README §13). Rien quand tout est parti. Toucher un mémo propose de le jeter.
 */
export function PendingMemos() {
  const { attente, envoi, jeter } = useMemos();
  const [choisi, definirChoisi] = useState<string | null>(null);
  if (attente.length === 0) {
    return null;
  }
  return (
    <section aria-label="Mémos pas encore envoyés" className="mx-1 mt-2 rounded-xl bg-texte/5 px-1 py-2">
      <h2 className="flex items-center gap-2 px-2 py-1 text-sm font-medium">
        {envoi ? <LoaderCircle className="size-4 animate-spin text-accent" aria-hidden="true" /> : <Mic className="size-4 text-discret" aria-hidden="true" />}
        {titreDeLAttente(attente.length)}
      </h2>
      <ul>
        {attente.map((memo) => (
          <li key={memo.nom}>
            <button
              type="button"
              onClick={() => definirChoisi(memo.nom)}
              className="flex w-full items-baseline justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-sm outline-none active:bg-texte/10 focus-visible:bg-texte/15"
            >
              <span className="min-w-0 truncate">{libelleDuMemo(memo.nom)}</span>
              <span className="shrink-0 text-discret">{tailleLisible(memo.taille)}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="px-2 py-1 text-xs text-discret">{envoi ? 'Envoi sur le NAS…' : 'Ils partiront sur le NAS dès qu’il répondra.'}</p>
      {choisi !== null && (
        <Sheet titre={libelleDuMemo(choisi)} fermer={() => definirChoisi(null)}>
          <p className="px-4 pb-2 text-sm text-discret">Il n’est pas encore sur le NAS : jeté, il est perdu.</p>
          <ActionDeFeuille
            icone={<Trash2 className="size-5 text-erreur" aria-hidden="true" />}
            libelle="Jeter ce mémo"
            onClick={() => {
              definirChoisi(null);
              void jeter(choisi);
            }}
          />
        </Sheet>
      )}
    </section>
  );
}
