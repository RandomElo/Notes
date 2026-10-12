import type { BrokenMention } from '@notes/core';
import { FileSearch, FileText } from 'lucide-react';
import { useState } from 'react';
import { api } from '../../lib/ipc';

type Recherche = { etat: 'pas-faite' } | { etat: 'en-cours' } | { etat: 'faite'; mentions: BrokenMention[] };

/**
 * Mentions cassées (docs/spec/editeur.md) : les liens vers une page qui n'existe pas (ou
 * plus) dans le dossier des notes, page par page, avec de quoi ouvrir la page
 * qui les contient. Elles s'y affichent barrées.
 */
export function BrokenMentions({ surOuverture }: { surOuverture: (chemin: string) => void }) {
  const [recherche, definirRecherche] = useState<Recherche>({ etat: 'pas-faite' });
  const chercher = (): void => {
    definirRecherche({ etat: 'en-cours' });
    void api.listerMentionsCassees().then((mentions) => definirRecherche({ etat: 'faite', mentions }));
  };
  return (
    <section aria-labelledby="titre-mentions" className="space-y-4">
      <div>
        <h2 id="titre-mentions" className="text-xl font-semibold">
          Mentions cassées
        </h2>
        <p className="text-discret mt-1 text-sm">Les liens vers une page qui n'est pas dans le dossier des notes. Ils restent dans le texte, barrés.</p>
      </div>
      <div className="bg-surface space-y-3 rounded-lg p-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p role="status">
            {recherche.etat === 'pas-faite'
              ? 'Pas encore cherché.'
              : recherche.etat === 'en-cours'
                ? 'Recherche en cours…'
                : recherche.mentions.length === 0
                  ? 'Aucune mention cassée.'
                  : recherche.mentions.length === 1
                    ? 'Une mention cassée.'
                    : `${recherche.mentions.length} mentions cassées.`}
          </p>
          <button
            type="button"
            onClick={chercher}
            disabled={recherche.etat === 'en-cours'}
            className="bg-accent/20 hover:bg-accent/35 focus-visible:bg-accent/45 inline-flex h-8 items-center justify-center gap-2 rounded-md px-3 leading-none font-medium whitespace-nowrap outline-0 disabled:opacity-50"
          >
            <FileSearch className="size-4 shrink-0" aria-hidden="true" />
            Chercher
          </button>
        </div>
        {recherche.etat === 'faite' && recherche.mentions.length > 0 && (
          <ul className="space-y-1">
            {recherche.mentions.map((mention) => (
              <li key={`${mention.chemin}:${mention.id}`} className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate">
                  <span className="line-through">{mention.libelle === '' ? 'Sans texte' : mention.libelle}</span>
                  <span className="text-discret"> dans {mention.titre}</span>
                </span>
                <button
                  type="button"
                  onClick={() => surOuverture(mention.chemin)}
                  className="hover:bg-texte/10 focus-visible:bg-accent/30 inline-flex shrink-0 items-center gap-1.5 rounded px-2 py-1 outline-0"
                >
                  <FileText className="size-3.5" aria-hidden="true" />
                  Ouvrir la page
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
