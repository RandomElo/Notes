import type { TreeNode } from '@notes/core';
import { PageView } from '@notes/ui';
import { ArrowDownToLine, FilePlus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/ipc';
import { adresseDImage, dossierDeLaPage } from '../images/image-url';

interface PageSummaryProps {
  noeud: TreeNode | null;
  surCreation: () => void;
  surImport: (noeud: TreeNode) => void;
}

/** Zone centrale quand aucune page n'est ouverte, ou pour un élément venu d'un autre outil : import proposé, contenu montré en lecture seule. */
export function PageSummary({ noeud, surCreation, surImport }: PageSummaryProps) {
  if (noeud === null) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <p className="text-discret text-sm">Choisis une page dans l'arborescence, ou crée-en une.</p>
        <button
          type="button"
          onClick={surCreation}
          className="border-bordure hover:bg-bordure/60 mt-4 inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium"
        >
          <FilePlus className="size-4" aria-hidden="true" />
          Nouvelle page
        </button>
      </div>
    );
  }

  return (
    <article className="mx-auto max-w-2xl py-10">
      <p className="text-discret text-xs">{noeud.chemin.split('/').join(' / ')}</p>
      <h2 className="mt-2 text-3xl font-bold">{noeud.titre}</h2>

      {!noeud.importe && (
        <div className="border-bordure bg-surface mt-6 rounded-lg border p-5 text-sm">
          <p>
            Cet élément vient d'un autre outil et n'a pas encore d'identifiant. Rien n'y est modifié tant que tu ne
            l'importes pas.
          </p>
          <p className="text-discret mt-2">
            {noeud.genre === 'fichier'
              ? "L'import crée un dossier à son nom et y déplace le fichier, avec un en-tête ajouté. Son texte n'est pas modifié."
              : "L'import ajoute un en-tête au fichier de la page. Son texte n'est pas modifié."}
          </p>
          <button
            type="button"
            onClick={() => surImport(noeud)}
            className="bg-accent text-fond mt-4 flex items-center gap-2 rounded-md px-3 py-2 font-medium hover:brightness-110"
          >
            <ArrowDownToLine className="size-4" aria-hidden="true" />
            Importer dans Notes
          </button>
        </div>
      )}

      {!noeud.importe && noeud.genre !== 'dossier' && <ForeignPreview chemin={noeud.chemin} dossier={dossierDeLaPage(noeud.chemin, noeud.genre)} />}
    </article>
  );
}

/** Contenu d'un élément non importé, en lecture seule : on voit ce qu'on s'apprête à importer, sans rien écrire. */
function ForeignPreview({ chemin, dossier }: { chemin: string; dossier: string }) {
  const resoudreImage = useCallback((src: string) => adresseDImage(dossier, src), [dossier]);
  const [corps, definirCorps] = useState<string | null>(null);

  useEffect(() => {
    let actif = true;
    void api.lirePage({ chemin }).then((lu) => {
      if (actif) {
        definirCorps(lu.ok ? lu.corps : null);
      }
    });
    return () => {
      actif = false;
    };
  }, [chemin]);

  return corps === null || corps.trim() === '' ? null : (
    <section aria-label="Aperçu du contenu" className="mt-8">
      <PageView corps={corps} resoudreImage={resoudreImage} />
    </section>
  );
}
