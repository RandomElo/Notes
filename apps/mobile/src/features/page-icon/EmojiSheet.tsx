import { chercherEmojis, groupesDEmojis } from '@notes/ui/emoji';
import { useMemo, useState } from 'react';
import { Sheet } from '../../components/Sheet';

/**
 * Choix de l'icône d'une page sur le téléphone (demande d'Eloi, 0.15.7) :
 * un emoji, cherché en français, ou rien. Pas d'image ni de détourage, qui
 * restent sur le PC. Chargé seulement à l'ouverture : la liste est lourde.
 */
export default function EmojiSheet({ actuelle, choisir, fermer }: { actuelle: string | null; choisir: (emoji: string | null) => void; fermer: () => void }) {
  const [recherche, definirRecherche] = useState('');
  const trouves = useMemo(() => chercherEmojis(recherche), [recherche]);
  const parGroupe = useMemo(
    () => (recherche.trim() === '' ? groupesDEmojis.map((groupe) => ({ nom: groupe.nom, emojis: trouves.filter((entree) => entree.groupe === groupe.groupe) })) : [{ nom: '', emojis: trouves.slice(0, 160) }]),
    [recherche, trouves],
  );
  return (
    <Sheet titre="Icône de la page" fermer={fermer} haute>
      <div className="flex shrink-0 gap-2 px-5 pb-2">
        <input
          value={recherche}
          onChange={(evenement) => definirRecherche(evenement.target.value)}
          placeholder="Chercher : livre, maison, course…"
          enterKeyHint="search"
          className="h-11 min-w-0 flex-1 rounded-lg bg-texte/10 px-3 text-base outline-none focus:bg-texte/15"
        />
        {actuelle !== null && (
          <button type="button" onClick={() => choisir(null)} className="shrink-0 rounded-lg px-3 text-discret outline-none active:bg-texte/10">
            Retirer
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-2">
        {parGroupe.map((groupe) =>
          groupe.emojis.length === 0 ? null : (
            <section key={groupe.nom}>
              {groupe.nom !== '' && <h2 className="px-2 pt-3 pb-1 text-xs text-discret">{groupe.nom}</h2>}
              <div className="grid grid-cols-8 gap-0.5">
                {groupe.emojis.map((entree) => (
                  <button
                    key={entree.emoji}
                    type="button"
                    aria-label={entree.libelle}
                    onClick={() => choisir(entree.emoji)}
                    className={`flex aspect-square items-center justify-center rounded-lg text-2xl outline-none ${entree.emoji === actuelle ? 'bg-accent/25' : 'active:bg-texte/15'}`}
                  >
                    {entree.emoji}
                  </button>
                ))}
              </div>
            </section>
          ),
        )}
        {trouves.length === 0 && <p className="px-2 py-6 text-center text-discret">Aucun emoji pour « {recherche} ».</p>}
      </div>
    </Sheet>
  );
}
