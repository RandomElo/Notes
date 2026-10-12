import { classerParTitre } from '@notes/core';
import type { Editor } from '@tiptap/react';
import { FileText } from 'lucide-react';
import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { PageIcon } from '../page-icon/PageIcon';
import { fermerMention, insererMention, mentionOuverte } from './mention-extension';
import type { MentionKey, MentionStorage } from './mention-extension';
import { annuaireDesPages } from './pages-directory';

/** Pages montrées au plus. */
const maxResultats = 30;
const maxRecentes = 8;

/**
 * Choix d'une page au « @ » (docs/spec/editeur.md) : les pages récentes, puis celles dont
 * le titre correspond à ce qui est tapé, recherche floue sans accents. Flèches
 * pour choisir, Entrée ou Tab pour valider, Échap pour fermer. Le focus reste
 * dans l'éditeur.
 */
export function MentionMenu({ editor }: { editor: Editor }) {
  const [, rafraichir] = useReducer((compteur: number) => compteur + 1, 0);
  const [choix, definirChoix] = useState(0);
  const liste = useRef<HTMLDivElement>(null);
  const [position, definirPosition] = useState<{ gauche: number; haut: number } | null>(null);

  useEffect(() => {
    editor.on('transaction', rafraichir);
    const desabonner = annuaireDesPages.abonner(rafraichir);
    return () => {
      editor.off('transaction', rafraichir);
      desabonner();
    };
  }, [editor]);

  const ouvert = editor.isDestroyed ? null : mentionOuverte(editor.state);
  const requete = ouvert?.requete ?? null;
  const pages = annuaireDesPages.liste();
  let trouvees = pages;
  if (requete !== null && requete.trim() !== '') {
    trouvees = classerParTitre(requete, pages, (page) => page.titre).map((resultat) => resultat.element);
  } else if (requete !== null) {
    const parId = new Map(pages.map((page) => [page.id, page]));
    const recentes = annuaireDesPages.recentes.flatMap((id) => parId.get(id.toLowerCase()) ?? []).slice(0, maxRecentes);
    trouvees = recentes.length > 0 ? recentes : pages;
  }
  trouvees = trouvees.slice(0, maxResultats);
  const rang = Math.min(choix, Math.max(0, trouvees.length - 1));

  useEffect(() => definirChoix(0), [requete]);

  useEffect(() => {
    const stockage = (editor.storage as unknown as { mentionMenu: MentionStorage }).mentionMenu;
    stockage.surTouche = (touche: MentionKey): boolean => {
      if (ouvert === null) {
        return false;
      }
      if (touche === 'fermer') {
        fermerMention(editor);
        return true;
      }
      if (trouvees.length === 0) {
        return false;
      }
      if (touche === 'valider') {
        const page = trouvees[rang];
        if (page !== undefined) {
          insererMention(editor, ouvert, page);
        }
      } else {
        definirChoix((rang + (touche === 'bas' ? 1 : -1) + trouvees.length) % trouvees.length);
      }
      return true;
    };
    return () => {
      stockage.surTouche = null;
    };
  });

  const de = ouvert?.de ?? null;
  useLayoutEffect(() => {
    if (de === null) {
      definirPosition(null);
      return;
    }
    const curseur = editor.view.coordsAtPos(de);
    const hauteur = liste.current?.offsetHeight ?? 0;
    const largeur = liste.current?.offsetWidth ?? 0;
    const dessous = curseur.bottom + 6;
    const haut = dessous + hauteur > window.innerHeight - 8 ? Math.max(8, curseur.top - hauteur - 6) : dessous;
    definirPosition({ gauche: Math.max(8, Math.min(curseur.left, window.innerWidth - largeur - 8)), haut });
  }, [editor, de, trouvees.length]);

  useLayoutEffect(() => {
    liste.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [rang, requete]);

  if (ouvert === null) {
    return null;
  }
  return (
    <div
      ref={liste}
      role="listbox"
      aria-label="Mentionner une page"
      style={{ left: position?.gauche ?? 0, top: position?.haut ?? 0, visibility: position === null ? 'hidden' : 'visible' }}
      className="border-bordure bg-surface fixed z-40 max-h-72 w-80 overflow-y-auto rounded-md border py-1 shadow-xl shadow-black/40"
    >
      <p className="text-discret px-3 pt-1 pb-1.5 text-xs">{requete === '' ? 'Mentionner une page' : 'Pages'}</p>
      {trouvees.length === 0 && <p className="text-discret px-3 py-2 text-sm">Aucune page pour « {requete} ».</p>}
      {trouvees.map((page, index) => (
        <button
          key={page.id}
          type="button"
          role="option"
          aria-selected={index === rang}
          onMouseDown={(evenement) => evenement.preventDefault()}
          onMouseEnter={() => definirChoix(index)}
          onClick={() => insererMention(editor, ouvert, page)}
          className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm ${index === rang ? 'bg-accent/25' : ''}`}
        >
          <PageIcon icone={page.icone} chemin={page.chemin} className="text-discret size-4 text-sm" defaut={<FileText className="text-discret size-4 shrink-0" aria-hidden="true" />} />
          <span className="min-w-0 truncate">{page.titre}</span>
          {page.chemin.includes('/') && <span className="text-discret ml-auto min-w-0 shrink truncate pl-2 text-xs">{page.chemin.split('/').slice(0, -1).join(' / ')}</span>}
        </button>
      ))}
    </div>
  );
}
