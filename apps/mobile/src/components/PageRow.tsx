import type { TreeNode } from '@notes/core';
import type { ReactNode } from 'react';
import { PageIcon } from './PageIcon';

/** Une page dans une liste (accueil, recherche) : icône, titre, et où elle se trouve. */
export function PageRow({ noeud, parents, adresse, titre, onClick }: { noeud: TreeNode; parents: readonly string[]; adresse: (chemin: string) => string | null; titre?: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left outline-none active:bg-texte/10 focus-visible:bg-texte/15">
      <PageIcon icone={noeud.icone} chemin={noeud.chemin} liste={noeud.mode === 'todo'} adresse={adresse} className="text-xl" />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{titre ?? noeud.titre}</span>
        {parents.length > 0 && <span className="block truncate text-xs text-discret">{parents.join(' › ')}</span>}
      </span>
    </button>
  );
}
