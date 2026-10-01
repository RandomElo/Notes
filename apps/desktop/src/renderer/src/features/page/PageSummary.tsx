import type { TreeNode } from '@notes/core';
import { ArrowDownToLine, FilePlus } from 'lucide-react';

interface PageSummaryProps {
  noeud: TreeNode | null;
  surCreation: () => void;
  surImport: (noeud: TreeNode) => void;
}

/** Zone centrale en attendant l'éditeur (J2) : rappelle la page ouverte, ou propose d'importer un élément étranger. */
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

      {noeud.importe ? (
        <p className="text-discret mt-6 text-sm">L'éditeur de contenu arrive au prochain jalon.</p>
      ) : (
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
    </article>
  );
}
