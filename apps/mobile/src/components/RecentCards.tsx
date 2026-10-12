import { useEffect, useRef, useState } from 'react';
import { useNavigation } from '../state/navigation';
import { useNotes } from '../state/NotesContext';
import { depuisQuand, nombreDePagesRecentes, pagesRecentes } from '../state/recent-pages';
import type { PageRecente } from '../state/recent-pages';
import { useCacheUrls } from '../state/useCacheUrls';
import { PageIcon } from './PageIcon';

const largeur = 'w-36 shrink-0';

/**
 * En haut de l'accueil, les 10 pages modifiées le plus récemment sur le NAS,
 * en cartes qui défilent à l'horizontale, comme sur Notion (choix d'Eloi,
 * 2026-10-11). Tant que la première sync de la session n'a pas répondu, des
 * cartes d'attente tiennent la place : la rangée ne change pas d'ordre sous
 * le doigt, et rien ne bouge en dessous.
 */
export function RecentCards() {
  const { arbre, etat, versionDuCache, datesDesPages } = useNotes();
  const navigation = useNavigation();
  const adresse = useCacheUrls();
  const [pages, definirPages] = useState<PageRecente[] | null>(null);
  /** Le NAS a répondu (ou su injoignable) au moins une fois depuis le lancement : la liste est la bonne. */
  const nasConsulte = useRef(false);
  if (etat.genre !== 'inconnu' && etat.genre !== 'synchro') {
    nasConsulte.current = true;
  }
  const pret = nasConsulte.current;

  useEffect(() => {
    if (!pret) {
      return;
    }
    let annule = false;
    void datesDesPages().then((dates) => {
      if (!annule) {
        definirPages(pagesRecentes(arbre, dates));
      }
    });
    return () => {
      annule = true;
    };
  }, [pret, arbre, versionDuCache, datesDesPages]);

  if (pages !== null && pages.length === 0) {
    return null;
  }
  const maintenant = Date.now();
  return (
    <section aria-label="Pages récentes" className="mt-2">
      <h2 className="px-3 pb-2 text-sm font-medium text-discret">Récentes</h2>
      <div className="flex gap-2 overflow-x-auto px-2 pb-1 [scrollbar-width:none]">
        {pages === null
          ? Array.from({ length: 4 }, (_, rang) => (
              <div key={rang} aria-hidden="true" className={`${largeur} h-[6.5rem] animate-pulse rounded-xl bg-texte/8`} />
            ))
          : pages.slice(0, nombreDePagesRecentes).map(({ noeud, parents, modifieLe }) => (
              <button
                key={noeud.chemin}
                type="button"
                onClick={() => navigation.ouvrir({ nom: 'page', chemin: noeud.chemin })}
                className={`${largeur} flex h-[6.5rem] flex-col rounded-xl bg-texte/5 p-3 text-left outline-none active:bg-texte/12 focus-visible:bg-texte/15`}
              >
                <span className="flex h-6 items-center self-start">
                  <PageIcon icone={noeud.icone} chemin={noeud.chemin} liste={noeud.mode === 'todo'} adresse={adresse} className="text-xl" />
                </span>
                <span className="mt-1.5 line-clamp-2 text-sm leading-snug font-medium break-words">{noeud.titre}</span>
                <span className="mt-auto truncate text-xs text-discret">{parents.length > 0 ? `${parents.at(-1)} · ` : ''}{depuisQuand(modifieLe, maintenant)}</span>
              </button>
            ))}
      </div>
    </section>
  );
}
