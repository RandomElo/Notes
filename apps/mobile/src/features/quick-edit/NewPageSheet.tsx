import { useState } from 'react';
import type { FormEvent } from 'react';
import { Sheet } from '../../components/Sheet';
import { useNotes } from '../../state/NotesContext';

/** Création d'une page simple sur le NAS (docs/spec/android.md) : un titre, classique ou en liste de tâches. */
export function NewPageSheet({ parent, titreDuParent, creee, fermer }: { parent: string; titreDuParent: string | null; creee: (chemin: string) => void; fermer: () => void }) {
  const { creerPage, modifiable } = useNotes();
  const [titre, definirTitre] = useState('');
  const [modeListe, definirModeListe] = useState(false);
  const [envoi, definirEnvoi] = useState(false);

  const envoyer = async (evenement: FormEvent): Promise<void> => {
    evenement.preventDefault();
    if (titre.trim() === '') {
      return;
    }
    definirEnvoi(true);
    const page = await creerPage(parent, titre, modeListe);
    definirEnvoi(false);
    if (page !== null) {
      creee(page.chemin);
    }
  };

  const choix = (valeur: boolean, libelle: string) => (
    <button
      type="button"
      aria-pressed={modeListe === valeur}
      onClick={() => definirModeListe(valeur)}
      className={`flex-1 rounded-lg px-3 py-2.5 outline-none ${modeListe === valeur ? 'bg-accent/25 font-medium' : 'bg-texte/10 active:bg-texte/15'}`}
    >
      {libelle}
    </button>
  );

  return (
    <Sheet titre={titreDuParent === null ? 'Nouvelle page' : `Nouvelle page dans « ${titreDuParent} »`} fermer={fermer}>
      <form onSubmit={(evenement) => void envoyer(evenement)} className="space-y-4 px-5 pb-2">
        <label className="block">
          <span className="text-sm font-medium">Titre</span>
          <input
            value={titre}
            autoFocus
            onChange={(evenement) => definirTitre(evenement.target.value)}
            enterKeyHint="done"
            className="mt-1 h-12 w-full rounded-lg bg-texte/10 px-3 text-base outline-none focus:bg-texte/15"
          />
        </label>
        <div className="flex gap-2">
          {choix(false, 'Page classique')}
          {choix(true, 'Liste de tâches')}
        </div>
        {!modifiable && <p className="text-sm text-discret">Pas de NAS : la page sera gardée sur le téléphone et créée sur le NAS dès qu’il répondra.</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={fermer} className="rounded-lg px-4 py-2.5 outline-none active:bg-texte/10 focus-visible:bg-texte/15">
            Annuler
          </button>
          <button
            type="submit"
            disabled={envoi || titre.trim() === ''}
            className="rounded-lg bg-accent px-4 py-2.5 font-medium text-fond outline-none active:bg-accent/80 disabled:bg-accent/40"
          >
            {envoi ? 'Création…' : 'Créer'}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
