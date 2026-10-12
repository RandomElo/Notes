import { TextSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { BookPlus, EyeOff, SpellCheck, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { api } from '../../lib/ipc';
import { caractereDeRemplacement, texteDuBloc } from './block-text';
import { contexteDeFaute } from './fault-context';
import { fautesDeLaPage } from './spellcheck-extension';
import type { FauteSoulignee } from './spellcheck-extension';
import { ignorerLaRemarque } from './useSpellcheck';
import { magasinDeCorrection, useMagasinDeCorrection } from './spellcheck-store';

const bouton = 'hover:bg-texte/10 focus-visible:bg-accent/30 inline-flex h-7 items-center gap-1.5 rounded px-2 text-sm outline-0';

/** La phrase de la faute, lue dans son bloc. Une mention y apparaît comme « @ ». */
function contexte(vue: EditorView, { de, a }: FauteSoulignee) {
  const position = vue.state.doc.resolve(de);
  const debutDuTexte = position.start();
  const texte = texteDuBloc(position.parent).texte.replaceAll(caractereDeRemplacement, '@');
  return contexteDeFaute(texte, de - debutDuTexte, a - debutDuTexte);
}

interface SpellcheckDialogProps {
  vue: EditorView;
  surFermeture: () => void;
}

/**
 * Toutes les fautes de la page ouverte (docs/spec/correction.md), ouvertes d'un clic sur le
 * compteur de la barre de statut : chacune dans sa phrase, avec ce que dit la
 * règle, les suggestions, « Ignorer » et « Ajouter au dictionnaire ». La liste
 * suit la page : une faute corrigée en disparaît, le focus passe à la suivante.
 * Un clic sur la phrase mène au mot dans la page.
 */
export function SpellcheckDialog({ vue, surFermeture }: SpellcheckDialogProps) {
  // Relu à chaque changement des fautes soulignées.
  useMagasinDeCorrection();
  const fautes = vue.isDestroyed ? [] : fautesDeLaPage(vue.state);
  const liste = useRef<HTMLUListElement>(null);
  const fenetre = useRef<HTMLDivElement>(null);
  /** Rang de la faute qui doit prendre le focus au prochain affichage (après une correction). */
  const focusAuRang = useRef<number | null>(0);

  useLayoutEffect(() => {
    const rang = focusAuRang.current;
    if (rang === null) {
      return;
    }
    const lignes = liste.current?.querySelectorAll<HTMLElement>('li[data-faute]');
    if (lignes === undefined || lignes.length === 0) {
      return;
    }
    focusAuRang.current = null;
    lignes[Math.min(rang, lignes.length - 1)]?.querySelector<HTMLElement>('button[data-premier]')?.focus();
  });

  // Liste vide (dernière faute traitée) : le focus reste dans la fenêtre, pour qu'Échap la ferme.
  useEffect(() => {
    if (fautes.length === 0) {
      fenetre.current?.focus();
    }
  }, [fautes.length]);

  const apresAction = (rang: number): void => {
    focusAuRang.current = rang;
  };
  const remplacer = (cible: FauteSoulignee, suggestion: string, rang: number): void => {
    apresAction(rang);
    vue.dispatch(vue.state.tr.insertText(suggestion, cible.de, cible.a));
  };
  const allerAuMot = (cible: FauteSoulignee): void => {
    surFermeture();
    vue.dispatch(vue.state.tr.setSelection(TextSelection.create(vue.state.doc, cible.de, cible.a)).scrollIntoView());
    vue.focus();
  };

  // Flèches haut et bas : d'une faute à l'autre ; Échap ferme.
  const surTouche = (evenement: KeyboardEvent): void => {
    if (evenement.key === 'Escape') {
      evenement.preventDefault();
      evenement.stopPropagation();
      surFermeture();
      vue.focus();
      return;
    }
    if (evenement.key !== 'ArrowDown' && evenement.key !== 'ArrowUp') {
      return;
    }
    const lignes = [...(liste.current?.querySelectorAll<HTMLElement>('li[data-faute]') ?? [])];
    const actuelle = lignes.findIndex((ligne) => ligne.contains(document.activeElement));
    const suivante = lignes[Math.max(0, Math.min(lignes.length - 1, actuelle + (evenement.key === 'ArrowDown' ? 1 : -1)))];
    if (suivante !== undefined) {
      evenement.preventDefault();
      const premier = suivante.querySelector<HTMLElement>('button[data-premier]');
      premier?.focus();
      premier?.scrollIntoView({ block: 'nearest' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[8vh]" onMouseDown={surFermeture}>
      <div
        ref={fenetre}
        role="dialog"
        aria-modal="true"
        aria-label="Fautes de la page"
        tabIndex={-1}
        onKeyDown={surTouche}
        className="bg-surface flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg shadow-2xl outline-0"
        onMouseDown={(evenement) => evenement.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 pt-3 pb-2">
          <SpellCheck className="text-accent size-4 shrink-0" aria-hidden="true" />
          <h2 className="text-sm font-semibold">
            {fautes.length === 0 ? 'Aucune faute' : fautes.length === 1 ? '1 faute dans la page' : `${fautes.length} fautes dans la page`}
          </h2>
          <p className="text-discret ml-2 hidden text-xs sm:block">↑ ↓ pour passer d'une faute à l'autre</p>
          <button
            type="button"
            onClick={() => {
              surFermeture();
              vue.focus();
            }}
            aria-label="Fermer"
            className="text-discret hover:bg-texte/10 focus-visible:bg-accent/30 ml-auto rounded p-1 outline-0"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        {fautes.length === 0 ? (
          <p className="text-discret px-4 pb-5 text-sm">Plus aucune faute dans la page.</p>
        ) : (
          <ul ref={liste} className="space-y-1 overflow-y-auto px-2 pb-2">
            {fautes.map((cible, rang) => {
              const { avant, mot, apres, coupeAvant, coupeApres } = contexte(vue, cible);
              const { faute } = cible;
              const editable = vue.editable;
              return (
                <li key={`${cible.de}-${faute.regle}`} data-faute="" className="focus-within:bg-texte/5 rounded-md px-2 py-2">
                  <button
                    type="button"
                    data-premier={!editable || faute.suggestions.length === 0 ? '' : undefined}
                    onClick={() => allerAuMot(cible)}
                    title="Aller au mot dans la page"
                    className="hover:bg-texte/10 focus-visible:bg-accent/30 w-full rounded px-1 py-0.5 text-left text-sm leading-6 outline-0"
                  >
                    {coupeAvant && '… '}
                    {avant}
                    <span className={faute.nature === 'orthographe' ? 'faute-orthographe' : 'faute-grammaire'}>{mot}</span>
                    {apres}
                    {coupeApres && ' …'}
                  </button>
                  <p className="text-discret px-1 text-xs">{faute.message === '' ? 'Faute possible.' : faute.message}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {editable &&
                      faute.suggestions.map((suggestion, indice) => (
                        <button
                          key={suggestion}
                          type="button"
                          data-premier={indice === 0 ? '' : undefined}
                          onClick={() => remplacer(cible, suggestion, rang)}
                          className={`${bouton} text-accent bg-accent/10 font-medium`}
                        >
                          {suggestion === '' ? '(supprimer)' : suggestion}
                        </button>
                      ))}
                    <button
                      type="button"
                      onClick={() => {
                        apresAction(rang);
                        ignorerLaRemarque(faute);
                      }}
                      className={`${bouton} text-discret`}
                    >
                      <EyeOff className="size-3.5" aria-hidden="true" />
                      Ignorer
                    </button>
                    {faute.nature === 'orthographe' && (
                      <button
                        type="button"
                        onClick={() => {
                          apresAction(rang);
                          void api.ajouterAuDictionnaire({ mot: faute.mot }).then(magasinDeCorrection.definirDictionnaire);
                        }}
                        className={`${bouton} text-discret`}
                      >
                        <BookPlus className="size-3.5" aria-hidden="true" />
                        Ajouter au dictionnaire
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
