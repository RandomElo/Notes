import { LoaderCircle, Plus, Search, Settings } from 'lucide-react';
import { useState } from 'react';
import { PageTree } from '../components/PageTree';
import { PullToRefresh } from '../components/PullToRefresh';
import { RecentCards } from '../components/RecentCards';
import { StatusPill } from '../components/StatusPill';
import { BoutonIcone, TopBar } from '../components/TopBar';
import { useNavigation } from '../state/navigation';
import { useNotes } from '../state/NotesContext';
import { useCacheUrls } from '../state/useCacheUrls';
import { NewPageSheet } from '../features/quick-edit/NewPageSheet';
import { PendingMemos } from '../features/voice-memos/PendingMemos';
import { RecordButton } from '../features/voice-memos/RecordButton';

/**
 * Accueil (choix d'Eloi, 0.15.7) : les pages récentes en cartes (2026-10-11),
 * puis l'arborescence des pages. On déplie, on ouvre ; « + » en haut crée une
 * page à la racine, celui d'une page une page dessous. Tirer vers le bas
 * synchronise. Le micro, en bas à droite, enregistre un mémo vocal (J17) ;
 * ceux qui ne sont pas encore sur le NAS sont listés sous la pastille.
 */
export function Home() {
  const { arbre, etat, synchroniser } = useNotes();
  const navigation = useNavigation();
  const adresse = useCacheUrls();
  const [creation, definirCreation] = useState<{ parent: string; titre: string | null } | null>(null);
  const ouvrirPage = (chemin: string): void => navigation.ouvrir({ nom: 'page', chemin });

  return (
    <div className="min-h-dvh">
      <TopBar
        titre="Notes"
        droite={
          <>
            <BoutonIcone libelle="Nouvelle page" onClick={() => definirCreation({ parent: '', titre: null })}>
              <Plus className="size-5" />
            </BoutonIcone>
            <BoutonIcone libelle="Rechercher" onClick={() => navigation.ouvrir({ nom: 'recherche' })}>
              <Search className="size-5" />
            </BoutonIcone>
            <BoutonIcone libelle="Réglages" onClick={() => navigation.ouvrir({ nom: 'reglages' })}>
              <Settings className="size-5" />
            </BoutonIcone>
          </>
        }
      />
      <PullToRefresh onRefresh={() => void synchroniser(true)}>
        {arbre.length === 0 && etat.genre === 'synchro' ? (
          <PremierTelechargement faits={etat.faits} total={etat.total} />
        ) : (
          <main className="marge-bas px-1 pb-24">
            <div className="px-1">
              <StatusPill />
            </div>
            <PendingMemos />
            <RecentCards />
            {arbre.length > 0 && <h2 className="px-3 pt-4 pb-1 text-sm font-medium text-discret">Pages</h2>}
            {arbre.length === 0 ? (
              <p className="px-3 py-10 text-center text-discret">Aucune page sur le téléphone pour l’instant. Elles arrivent à la prochaine synchronisation.</p>
            ) : (
              <nav aria-label="Pages" className="mt-2">
                <PageTree
                  arbre={arbre}
                  deplies={navigation.deplies}
                  basculer={navigation.basculer}
                  ouvrirPage={ouvrirPage}
                  adresse={adresse}
                  nouvellePage={(parent, titre) => definirCreation({ parent, titre })}
                />
              </nav>
            )}
          </main>
        )}
      </PullToRefresh>
      <RecordButton />
      {creation !== null && (
        <NewPageSheet
          parent={creation.parent}
          titreDuParent={creation.titre}
          fermer={() => definirCreation(null)}
          creee={(chemin) => {
            definirCreation(null);
            ouvrirPage(chemin);
          }}
        />
      )}
    </div>
  );
}

/** Rien encore sur le téléphone : l'avancement au milieu de l'écran, à la place de la pastille. */
function PremierTelechargement({ faits, total }: { faits: number; total: number }) {
  return (
    <main className="marge-bas flex min-h-[calc(100dvh-8rem)] flex-col items-center justify-center gap-4 px-10 text-center">
      <LoaderCircle className="size-8 animate-spin text-accent" aria-hidden="true" />
      <p className="font-medium">Premier téléchargement des pages</p>
      <div className="h-1.5 w-full max-w-64 overflow-hidden rounded-full bg-texte/10">
        <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: total > 0 ? `${Math.round((faits / total) * 100)}%` : '0%' }} />
      </div>
      <p className="text-sm text-discret">{total > 0 ? `${faits} sur ${total}` : 'Liste des pages sur le NAS…'}</p>
    </main>
  );
}
