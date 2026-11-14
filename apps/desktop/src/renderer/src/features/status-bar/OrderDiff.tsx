import type { OrderConflict, OrderEntry } from '@notes/core';
import { useEffect, useState } from 'react';
import { api } from '../../lib/ipc';

/** Une colonne : l'ordre d'une version, ce qui la distingue de l'autre en couleur de fond et en mot. */
function Colonne({ titre, pages }: { titre: string; pages: OrderEntry[] }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="text-discret mb-1 text-xs font-medium">{titre}</p>
      <ol className="space-y-0.5 text-xs">
        {pages.map((page, rang) => (
          <li
            key={page.id}
            className={`flex items-baseline gap-1.5 rounded px-1.5 py-0.5 ${page.difference === 'seule' ? 'bg-alerte/20' : page.difference === 'deplacee' ? 'bg-accent/20' : ''}`}
          >
            <span className="text-discret w-4 shrink-0 text-right tabular-nums">{rang + 1}</span>
            <span className={`min-w-0 flex-1 truncate ${page.titre === null ? 'text-discret italic' : ''}`} title={page.titre ?? page.id}>
              {page.titre ?? 'Page qui n’existe plus'}
            </span>
            {page.difference !== null && <span className="text-discret shrink-0">{page.difference === 'seule' ? 'seule ici' : 'déplacée'}</span>}
          </li>
        ))}
        {pages.length === 0 && <li className="text-discret italic">Aucune page</li>}
      </ol>
    </div>
  );
}

/**
 * Différence entre l'ordre actuel des sous-pages d'un dossier et sa sauvegarde en conflit (docs/spec/sync.md) :
 * les deux listes côte à côte, en jaune une page qui n'est que d'un côté, en bleu une page qui a changé de rang.
 */
export function OrderDiff({ sauvegarde }: { sauvegarde: string }) {
  const [conflit, definirConflit] = useState<OrderConflict | string | null>(null);
  useEffect(() => {
    void api.lireConflitDOrdre({ sauvegarde }).then((lu) => definirConflit(lu.ok ? { actuel: lu.actuel, ancien: lu.ancien } : lu.erreur.message));
  }, [sauvegarde]);
  if (conflit === null) {
    return <p className="text-discret text-xs">Lecture…</p>;
  }
  if (typeof conflit === 'string') {
    return <p className="text-erreur text-xs">{conflit}</p>;
  }
  return (
    <div aria-label="Différence entre les deux ordres" className="bg-fond flex gap-3 rounded-md p-2">
      <Colonne titre="Ordre actuel" pages={conflit.actuel} />
      <Colonne titre="Version mise de côté" pages={conflit.ancien} />
    </div>
  );
}
