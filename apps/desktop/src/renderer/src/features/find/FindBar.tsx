import { TextSelection } from '@tiptap/pm/state';
import type { Editor } from '@tiptap/react';
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { useEffect, useReducer, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { cleDeLaRecherche } from './find-extension';

/**
 * Barre de recherche dans la page (`Ctrl+F`, docs/spec/editeur.md), en haut à droite de la
 * page. On tape, les passages trouvés se surlignent ; `Entrée` et `Maj+Entrée` vont au suivant
 * et au précédent ; `Échap` la ferme et sélectionne le passage en cours dans la page.
 */
export function FindBar({ editor }: { editor: Editor }) {
  const [ouverte, definirOuverte] = useState(false);
  const [requete, definirRequete] = useState('');
  const [, rafraichir] = useReducer((compteur: number) => compteur + 1, 0);
  const champ = useRef<HTMLInputElement>(null);

  // Ctrl+F, où que soit le focus dans la fenêtre : un texte sélectionné dans la page devient la recherche.
  useEffect(() => {
    const surTouche = (evenement: globalThis.KeyboardEvent): void => {
      if (!evenement.ctrlKey || evenement.altKey || evenement.shiftKey || evenement.key.toLowerCase() !== 'f' || document.querySelector('[aria-modal="true"]') !== null) {
        return;
      }
      evenement.preventDefault();
      const { selection, doc } = editor.state;
      const choisi = selection.empty ? '' : doc.textBetween(selection.from, selection.to, ' ');
      if (choisi !== '' && !choisi.includes('\n') && choisi.length <= 100) {
        definirRequete(choisi);
        editor.view.dispatch(editor.state.tr.setMeta(cleDeLaRecherche, { requete: choisi }).setMeta('addToHistory', false));
      }
      definirOuverte(true);
      window.requestAnimationFrame(() => {
        champ.current?.focus();
        champ.current?.select();
      });
    };
    window.addEventListener('keydown', surTouche);
    editor.on('transaction', rafraichir);
    return () => {
      window.removeEventListener('keydown', surTouche);
      editor.off('transaction', rafraichir);
    };
  }, [editor]);

  const etat = editor.isDestroyed ? undefined : cleDeLaRecherche.getState(editor.state);
  const trouves = etat?.trouves ?? [];
  const courant = etat?.courant ?? -1;

  // Le passage en cours reste visible, au milieu de la fenêtre.
  const enCours = courant >= 0 ? trouves[courant] : undefined;
  useEffect(() => {
    if (!ouverte || enCours === undefined) {
      return;
    }
    const { node } = editor.view.domAtPos(enCours.from);
    const element = node instanceof Element ? node : node.parentElement;
    element?.scrollIntoView({ block: 'center' });
  }, [editor, ouverte, enCours?.from]);

  const chercher = (texte: string): void => {
    definirRequete(texte);
    editor.view.dispatch(editor.state.tr.setMeta(cleDeLaRecherche, { requete: texte }).setMeta('addToHistory', false));
  };
  const aller = (sens: 1 | -1): void => {
    editor.view.dispatch(editor.state.tr.setMeta(cleDeLaRecherche, { courant: courant + sens }).setMeta('addToHistory', false));
  };
  const fermer = (garderLePassage: boolean): void => {
    definirOuverte(false);
    const tr = editor.state.tr.setMeta(cleDeLaRecherche, { requete: '' }).setMeta('addToHistory', false);
    if (garderLePassage && enCours !== undefined) {
      tr.setSelection(TextSelection.create(editor.state.doc, enCours.from, enCours.to));
    }
    editor.view.dispatch(tr);
    editor.view.focus();
  };

  const surTouche = (evenement: KeyboardEvent<HTMLInputElement>): void => {
    if (evenement.key === 'Enter') {
      evenement.preventDefault();
      aller(evenement.shiftKey ? -1 : 1);
    } else if (evenement.key === 'Escape') {
      evenement.preventDefault();
      evenement.stopPropagation();
      fermer(true);
    }
  };

  if (!ouverte) {
    return null;
  }
  const compte = requete.trim() === '' ? '' : trouves.length === 0 ? 'Aucun résultat' : `${courant + 1} sur ${trouves.length}`;
  const bouton = 'text-discret hover:bg-texte/10 hover:text-texte focus-visible:bg-texte/20 flex size-7 shrink-0 items-center justify-center rounded outline-0 disabled:opacity-40';
  return (
    // Une seule surface, champ compris : pas de deuxième fond autour du texte.
    <div role="search" aria-label="Rechercher dans la page" className="bg-surface fixed top-24 right-8 z-40 flex items-center gap-1 rounded-lg py-1 pr-1 pl-3 shadow-xl shadow-black/40">
      <Search className="text-discret size-4 shrink-0" aria-hidden="true" />
      <input
        ref={champ}
        type="text"
        value={requete}
        onChange={(evenement) => chercher(evenement.target.value)}
        onKeyDown={surTouche}
        placeholder="Rechercher dans la page"
        aria-label="Rechercher dans la page"
        spellCheck={false}
        className="placeholder:text-discret w-56 bg-transparent px-1 py-1 text-sm outline-0"
      />
      <span role="status" className={`text-discret shrink-0 text-xs whitespace-nowrap ${compte === '' ? '' : 'px-1'}`}>
        {compte}
      </span>
      <button type="button" onClick={() => aller(-1)} disabled={trouves.length === 0} aria-label="Précédent" title="Précédent (Maj+Entrée)" className={bouton}>
        <ChevronUp className="size-4" aria-hidden="true" />
      </button>
      <button type="button" onClick={() => aller(1)} disabled={trouves.length === 0} aria-label="Suivant" title="Suivant (Entrée)" className={bouton}>
        <ChevronDown className="size-4" aria-hidden="true" />
      </button>
      <button type="button" onClick={() => fermer(false)} aria-label="Fermer la recherche" title="Fermer (Échap)" className={bouton}>
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
