import { FolderOpen, FolderPlus } from 'lucide-react';
import type { Vault } from '../../state/useVault';

/** Premier lancement : aucune page ne peut exister tant que le dossier des notes n'est pas choisi. */
export function VaultChooser({ vault, dossierPropose }: { vault: Vault; dossierPropose: string }) {
  return (
    <section aria-labelledby="titre-vault" className="mx-auto max-w-xl space-y-6 py-10">
      <div>
        <h2 id="titre-vault" className="text-xl font-semibold">
          Où ranger tes notes ?
        </h2>
        <p className="text-discret mt-2 text-sm">
          Les notes sont de simples fichiers Markdown, une page par dossier, dans un dossier de ce poste. Choisis un
          dossier réservé à cet usage : tout ce qu'il contient est considéré comme des notes.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => void vault.ouvrirDossier('propose')}
          className="bg-accent text-fond flex items-center gap-3 rounded-md px-4 py-3 text-left text-sm font-medium hover:brightness-110"
        >
          <FolderPlus className="size-5 shrink-0" aria-hidden="true" />
          <span>
            Utiliser le dossier proposé
            <span className="block font-normal opacity-80">{dossierPropose}</span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => void vault.ouvrirDossier('choisir')}
          className="border-bordure hover:bg-bordure/60 flex items-center gap-3 rounded-md border px-4 py-3 text-left text-sm font-medium"
        >
          <FolderOpen className="size-5 shrink-0" aria-hidden="true" />
          Choisir un autre dossier
        </button>
      </div>

      <div aria-live="polite">
        {vault.erreur !== null && (
          <p className="border-erreur/40 bg-erreur/10 rounded-md border p-3 text-sm">{vault.erreur}</p>
        )}
      </div>
    </section>
  );
}
