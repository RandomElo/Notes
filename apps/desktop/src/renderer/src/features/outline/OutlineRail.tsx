import type { OutlineEntry } from '@notes/document';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { libelleDuTitre } from './useOutline';

/** Un trait plus court à chaque niveau d'emboîtement. */
const largeurDesTraits = [18, 14, 11, 8, 6];
/** Hauteur au plus des traits et de la liste : au-delà, ils défilent pour garder le titre en cours au milieu. */
const hauteurMax = 'max-h-[min(60vh,32rem)]';
/** Bords estompés quand les traits ne tiennent pas : il y en a d'autres au-dessus ou au-dessous. */
const bordsEstompes = {
  lesDeux: '[mask-image:linear-gradient(to_bottom,transparent,black_12%,black_88%,transparent)]',
  haut: '[mask-image:linear-gradient(to_bottom,transparent,black_12%)]',
  bas: '[mask-image:linear-gradient(to_bottom,black_88%,transparent)]',
};

const estompage = ({ haut, bas }: { haut: boolean; bas: boolean }): string =>
  haut && bas ? bordsEstompes.lesDeux : haut ? bordsEstompes.haut : bas ? bordsEstompes.bas : '';

/** Fait défiler une boîte pour mettre son élément allumé au milieu. */
function centrerLAllume(boite: HTMLElement | null, comportement: ScrollBehavior): void {
  const cible = boite?.querySelector<HTMLElement>('[data-allume]');
  if (boite === null || boite === undefined || cible === null || cible === undefined) {
    return;
  }
  boite.scrollTo({ top: cible.offsetTop - boite.clientHeight / 2 + cible.offsetHeight / 2, behavior: comportement });
}

interface OutlineRailProps {
  entrees: readonly OutlineEntry[];
  courant: number;
  surChoix: (entree: OutlineEntry) => void;
}

/**
 * Sommaire latéral permanent (README §7), à droite de la page : au repos, un
 * trait par titre, celui où en est la lecture à la couleur d'accent ; au
 * survol ou au focus, les titres en clair. Hauteur limitée : quand les titres
 * ne tiennent pas, traits et liste défilent pour garder le titre en cours au
 * milieu, si bien qu'au survol son nom s'affiche à la hauteur de son trait.
 */
export function OutlineRail({ entrees, courant, surChoix }: OutlineRailProps) {
  const [ouvert, definirOuvert] = useState(false);
  const montrees = entrees.map((entree, rang) => ({ entree, rang }));
  const allume = courant;
  const traits = useRef<HTMLDivElement>(null);
  const liste = useRef<HTMLUListElement>(null);
  // Traits cachés au-dessus ou au-dessous : seul ce bord-là s'estompe. Tout en haut de la page, rien en haut.
  const [caches, definirCaches] = useState({ haut: false, bas: false });
  const relireCaches = useCallback(() => {
    const boite = traits.current;
    if (boite !== null) {
      const haut = boite.scrollTop > 1;
      const bas = boite.scrollTop + boite.clientHeight < boite.scrollHeight - 1;
      definirCaches((avant) => (avant.haut === haut && avant.bas === bas ? avant : { haut, bas }));
    }
  }, []);

  useLayoutEffect(() => {
    const boite = traits.current;
    centrerLAllume(boite, 'smooth');
    relireCaches();
  }, [allume, montrees.length]);
  // À l'ouverture, la liste se place d'un coup ; ensuite elle suit la lecture en douceur.
  useLayoutEffect(() => {
    if (ouvert) {
      centrerLAllume(liste.current, 'auto');
    }
  }, [ouvert]);
  useLayoutEffect(() => {
    if (ouvert) {
      centrerLAllume(liste.current, 'smooth');
    }
  }, [allume]);

  if (montrees.length === 0) {
    return null;
  }
  return (
    <nav
      aria-label="Sommaire"
      className="sticky top-14 -mr-4 ml-2 w-6 shrink-0 self-start"
      onMouseEnter={() => definirOuvert(true)}
      onMouseLeave={() => definirOuvert(false)}
      onFocus={() => definirOuvert(true)}
      onBlur={(evenement) => {
        if (!evenement.currentTarget.contains(evenement.relatedTarget as Node | null)) {
          definirOuvert(false);
        }
      }}
    >
      <div ref={traits} aria-hidden={ouvert} className={`relative flex flex-col items-end gap-2 overflow-hidden py-2 ${hauteurMax} ${estompage(caches)}`}
        onScroll={relireCaches}
      >
        {montrees.map(({ entree, rang }) => (
          <span
            key={entree.position}
            data-allume={rang === allume ? true : undefined}
            // Sans « shrink-0 », des traits trop nombreux pour la hauteur se tasseraient jusqu'à disparaître.
            className={`h-0.5 shrink-0 rounded-full ${rang === allume ? 'bg-accent' : 'bg-texte/25'}`}
            style={{ width: largeurDesTraits[Math.min(entree.profondeur, largeurDesTraits.length - 1)] }}
          />
        ))}
      </div>
      <ul
        ref={liste}
        className={`border-bordure bg-surface absolute top-0 right-0 w-64 overflow-y-auto rounded-lg border p-1.5 shadow-xl ${hauteurMax} ${ouvert ? '' : 'sr-only'}`}
      >
        {montrees.map(({ entree, rang }) => (
          <li key={entree.position} data-allume={rang === allume ? true : undefined}>
            <button
              type="button"
              aria-current={rang === allume ? 'location' : undefined}
              onClick={() => {
                definirOuvert(false);
                surChoix(entree);
              }}
              style={{ paddingLeft: 8 + entree.profondeur * 12 }}
              className={`block w-full truncate rounded-md py-1 pr-2 text-left text-xs outline-0 ${
                rang === allume ? 'bg-accent/20 text-texte focus-visible:bg-accent/35' : 'text-discret hover:bg-texte/10 hover:text-texte focus-visible:bg-texte/20 focus-visible:text-texte'
              }`}
            >
              {libelleDuTitre(entree)}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
