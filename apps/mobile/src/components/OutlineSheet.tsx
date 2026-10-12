import type { OutlineEntry } from '@notes/document';
import { Sheet } from './Sheet';

/** Taille du texte selon le niveau du titre, comme dans la page : un titre 1 plus grand qu'un titre 3. */
const tailles = ['', 'text-lg font-semibold', 'text-base font-semibold', 'text-[0.95rem] font-medium', 'text-sm', 'text-sm'];

/** Sommaire en version modale (README §15) : les titres de la page, avec leurs « # », un toucher y emmène. */
export function OutlineSheet({ entrees, choisir, fermer }: { entrees: readonly OutlineEntry[]; choisir: (rang: number) => void; fermer: () => void }) {
  return (
    <Sheet titre="Sommaire" fermer={fermer}>
      <ul className="px-2">
        {entrees.map((entree, rang) => (
          <li key={rang}>
            <button
              type="button"
              onClick={() => choisir(rang)}
              style={{ paddingLeft: 12 + entree.profondeur * 16 }}
              className={`flex w-full items-baseline gap-2 rounded-lg py-2 pr-3 text-left outline-none active:bg-texte/10 focus-visible:bg-texte/15 ${tailles[entree.niveau] ?? 'text-sm'}`}
            >
              <span aria-hidden="true" className="shrink-0 font-mono text-xs font-normal text-discret">
                {'#'.repeat(entree.niveau)}
              </span>
              <span className="min-w-0">{entree.texte.trim() === '' ? <span className="italic text-discret">Titre vide</span> : entree.texte}</span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
