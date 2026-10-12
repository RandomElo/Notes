import { classerParTitre } from '@notes/core';
import { ArrowLeft } from 'lucide-react';
import { useMemo, useState } from 'react';
import { PageRow } from '../components/PageRow';
import { BoutonIcone } from '../components/TopBar';
import { useNavigation } from '../state/navigation';
import { useNotes } from '../state/NotesContext';
import { pagesAplaties } from '../state/pages';
import { useCacheUrls } from '../state/useCacheUrls';

/** Recherche par titre (README §15), floue et insensible aux accents, comme `Ctrl+K` sur le desktop. Sans saisie : les récentes. */
export function Search() {
  const { arbre, reglages } = useNotes();
  const navigation = useNavigation();
  const adresse = useCacheUrls();
  const [saisie, definirSaisie] = useState('');
  const pages = useMemo(() => pagesAplaties(arbre), [arbre]);
  const resultats = useMemo(() => {
    if (saisie.trim() === '') {
      const parId = new Map(pages.map((page) => [page.noeud.id, page]));
      return reglages.recentes.flatMap((id) => parId.get(id) ?? []).map((page) => ({ page, lettres: [] as number[] }));
    }
    return classerParTitre(saisie, pages, (page) => page.noeud.titre)
      .slice(0, 50)
      .map(({ element, positions }) => ({ page: element, lettres: positions }));
  }, [saisie, pages, reglages.recentes]);

  return (
    <div className="min-h-dvh">
      <header className="marge-haut sticky top-0 z-20 bg-fond">
        <div className="flex h-14 items-center gap-1 px-1">
          <BoutonIcone libelle="Retour" onClick={navigation.retour}>
            <ArrowLeft className="size-5" />
          </BoutonIcone>
          <input
            autoFocus
            type="search"
            value={saisie}
            onChange={(evenement) => definirSaisie(evenement.target.value)}
            placeholder="Rechercher une page"
            enterKeyHint="search"
            className="h-11 min-w-0 flex-1 rounded-full bg-texte/10 px-4 text-base outline-none placeholder:text-discret focus:bg-texte/15"
          />
        </div>
      </header>
      <main className="marge-bas px-2 pb-6">
        {saisie.trim() === '' && resultats.length > 0 && <h2 className="px-3 pt-3 pb-1 text-xs font-semibold tracking-wide text-discret uppercase">Récentes</h2>}
        {saisie.trim() !== '' && resultats.length === 0 && <p className="px-3 py-6 text-center text-discret">Aucune page ne correspond.</p>}
        {resultats.map(({ page, lettres }) => (
          <PageRow
            key={page.noeud.chemin}
            noeud={page.noeud}
            parents={page.parents}
            adresse={adresse}
            titre={<TitreSouligne titre={page.noeud.titre} lettres={lettres} />}
            onClick={() => navigation.ouvrir({ nom: 'page', chemin: page.noeud.chemin })}
          />
        ))}
      </main>
    </div>
  );
}

/** Les lettres trouvées en couleur d'accent. */
function TitreSouligne({ titre, lettres }: { titre: string; lettres: readonly number[] }) {
  if (lettres.length === 0) {
    return <>{titre}</>;
  }
  const trouvees = new Set(lettres);
  // Les positions comptent en unités UTF-16 : un emoji en occupe deux mais ne se coupe pas.
  const caracteres: { lettre: string; position: number }[] = [];
  let position = 0;
  for (const lettre of titre) {
    caracteres.push({ lettre, position });
    position += lettre.length;
  }
  return (
    <>
      {caracteres.map(({ lettre, position: rang }) => (
        <span key={rang} className={trouvees.has(rang) ? 'text-accent' : undefined}>
          {lettre}
        </span>
      ))}
    </>
  );
}
