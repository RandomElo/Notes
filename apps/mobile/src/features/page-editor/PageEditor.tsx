import { ecrireMarkdown, lireMarkdown } from '@notes/document';
import { classeDePage, extensionsDAffichage } from '@notes/ui';
import type { ImageViewOptions, MentionViewOptions, PagesDirectory, SiteMentionOptions } from '@notes/ui';
import type { Editor } from '@tiptap/core';
import { Placeholder } from '@tiptap/extensions';
import { EditorContent, useEditor } from '@tiptap/react';
import { TextSelection } from '@tiptap/pm/state';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { useNotes } from '../../state/NotesContext';
import { tacheDeLaCase } from './task-checkbox';
import { CalloutSheet } from './CalloutSheet';
import { EditorToolbar } from './EditorToolbar';
import { MarkdownSheet } from './MarkdownSheet';

interface PageEditorProps {
  /** Dossier de la page : son verrou est tenu tant que le curseur est dans la page. */
  page: string;
  /** Corps affiché (usePageWrites). Quand il change sans venir de cet éditeur (PC, refus), l'éditeur le reprend. */
  corps: string;
  /** Faux sans NAS : la page se lit, rien ne s'écrit. */
  modifiable: boolean;
  /** Le nouveau corps, à afficher et à écrire sur le NAS. */
  remplacer: (nouveau: string) => boolean;
  resoudreImage: ImageViewOptions['resoudre'];
  absenceImage: ImageViewOptions['absence'];
  mentions: MentionViewOptions;
  sites: SiteMentionOptions;
}

/** Délai sans frappe avant d'écrire sur le NAS, et avant de rendre le verrou après la dernière saisie. */
const delaiDEnregistrementMs = 600;
const delaiDeRelacheMs = 1500;

/**
 * Page classique modifiable sur le téléphone (choix d'Eloi du 2026-10-10) :
 * on touche le texte, le curseur y va, une barre courte s'affiche au-dessus
 * du clavier. Même schéma et mêmes raccourcis de saisie que le PC ; la page
 * est réécrite comme sur le PC (seuls les blocs modifiés changent dans le
 * fichier) et part sur le NAS au fil de la frappe, sous le verrou de la page.
 */
export function PageEditor({ page, corps, modifiable, remplacer, resoudreImage, absenceImage, mentions, sites }: PageEditorProps) {
  const { commencerSaisie, finirSaisie, montrerAvis } = useNotes();
  const [focus, definirFocus] = useState(false);
  const [feuille, definirFeuille] = useState<'callout' | 'markdown' | null>(null);

  // L'éditeur est créé une fois : ses options lisent les dernières valeurs, sinon il serait recréé (et le curseur perdu) à chaque sync.
  const options = useRef({ resoudreImage, absenceImage, mentions, sites });
  options.current = { resoudreImage, absenceImage, mentions, sites };
  const extensions = useMemo(() => {
    const annuaire: PagesDirectory = {
      lire: (id) => options.current.mentions.pages?.lire(id) ?? null,
      abonner: (rappel) => options.current.mentions.pages?.abonner(rappel) ?? (() => undefined),
    };
    return [
      ...extensionsDAffichage(
        { resoudre: (src) => options.current.resoudreImage(src), absence: (src) => options.current.absenceImage?.(src) ?? null },
        { pages: annuaire, Icone: (props) => (options.current.mentions.Icone === undefined ? null : <options.current.mentions.Icone {...props} />), ouvrir: (id, nouvel) => options.current.mentions.ouvrir?.(id, nouvel) },
        { favicon: (href) => options.current.sites.favicon?.(href) ?? null },
      ),
      Placeholder.configure({ placeholder: 'Écrire…' }),
    ];
  }, []);

  /** Le Markdown d'origine de chaque bloc, pour ne réécrire que les blocs modifiés ; et le dernier corps venu de l'éditeur. */
  const source = useRef(lireMarkdown(corps).source);
  const dernier = useRef(corps);
  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null);
  const relache = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editeurCourant = useRef<Editor | null>(null);

  const enregistrer = useCallback(() => {
    if (minuterie.current !== null) {
      clearTimeout(minuterie.current);
      minuterie.current = null;
    }
    const editeur = editeurCourant.current;
    if (editeur === null || editeur.isDestroyed) {
      return;
    }
    const nouveau = ecrireMarkdown(editeur.state.doc, source.current);
    if (nouveau !== dernier.current) {
      dernier.current = nouveau;
      remplacer(nouveau);
    }
  }, [remplacer]);

  const editeur = useEditor({
    extensions,
    content: lireMarkdown(corps).document.toJSON(),
    editable: modifiable,
    shouldRerenderOnTransaction: true,
    editorProps: { attributes: { class: classeDePage } },
    onUpdate: ({ transaction }) => {
      if (transaction.getMeta('rafraichissement') === true) {
        return;
      }
      if (minuterie.current !== null) {
        clearTimeout(minuterie.current);
      }
      minuterie.current = setTimeout(enregistrer, delaiDEnregistrementMs);
    },
    onFocus: ({ editor }) => {
      definirFocus(true);
      if (relache.current !== null) {
        clearTimeout(relache.current);
        relache.current = null;
      }
      // Le verrou se prend sans faire attendre la saisie ; si le PC édite la page, la page repasse en lecture.
      void commencerSaisie(page).then((pris) => {
        if (!pris && !editor.isDestroyed) {
          editor.setEditable(false);
          editor.commands.blur();
        }
      });
    },
    onBlur: () => {
      definirFocus(false);
      enregistrer();
      relache.current = setTimeout(() => {
        relache.current = null;
        void finirSaisie(page);
      }, delaiDeRelacheMs);
    },
  });
  editeurCourant.current = editeur;

  useEffect(() => {
    editeur?.setEditable(modifiable);
  }, [editeur, modifiable]);

  // En quittant la page : dernière frappe écrite, verrou rendu.
  useEffect(
    () => () => {
      enregistrer();
      if (relache.current !== null) {
        clearTimeout(relache.current);
      }
      void finirSaisie(page);
    },
    [enregistrer, finirSaisie, page],
  );

  // Le corps a changé ailleurs (PC, écriture refusée) : l'éditeur reprend la version du NAS.
  useEffect(() => {
    if (editeur === null || corps === dernier.current) {
      return;
    }
    const lu = lireMarkdown(corps);
    source.current = lu.source;
    dernier.current = corps;
    editeur.commands.setContent(lu.document.toJSON(), { emitUpdate: false });
  }, [editeur, corps]);

  // Une image arrivée du NAS après la création de l'éditeur : ses vues se redessinent, sans rien changer à la page.
  useEffect(() => {
    if (editeur === null || editeur.isDestroyed) {
      return;
    }
    const tr = editeur.state.tr;
    editeur.state.doc.descendants((noeud, position) => {
      if (noeud.type.name === 'image') {
        tr.setNodeMarkup(position, undefined, { ...noeud.attrs });
      }
    });
    if (tr.steps.length > 0) {
      editeur.view.dispatch(tr.setMeta('addToHistory', false).setMeta('rafraichissement', true));
    }
  }, [editeur, resoudreImage]);

  /**
   * Une case touchée se coche sans ouvrir le clavier : TipTap mettrait le
   * curseur dans la page. Sans NAS, elle ne bouge pas.
   */
  const surClicDeCase = (evenement: MouseEvent): void => {
    const cible = evenement.target as HTMLElement;
    // Toucher l'icône d'un callout ouvre sa couleur et son icône, sans ouvrir le clavier.
    const iconeDeCallout = cible.closest('.callout-icone');
    if (iconeDeCallout !== null && editeur !== null) {
      evenement.preventDefault();
      evenement.stopPropagation();
      if (!modifiable || !editeur.isEditable) {
        montrerAvis('Le NAS ne répond pas : la page est en lecture seule.');
        return;
      }
      const contenuDuCallout = iconeDeCallout.parentElement?.querySelector('.callout-contenu');
      if (contenuDuCallout !== null && contenuDuCallout !== undefined) {
        const position = editeur.view.posAtDOM(contenuDuCallout, 0);
        editeur.view.dispatch(editeur.state.tr.setSelection(TextSelection.near(editeur.state.doc.resolve(position))));
        definirFeuille('callout');
      }
      return;
    }
    if (!(cible instanceof HTMLInputElement) || cible.type !== 'checkbox' || editeur === null) {
      return;
    }
    evenement.preventDefault();
    evenement.stopPropagation();
    if (!modifiable || !editeur.isEditable) {
      montrerAvis('Le NAS ne répond pas : la page est en lecture seule.');
      return;
    }
    const position = tacheDeLaCase(cible, editeur);
    // Après l'événement : le clic annulé remet la case dans son ancien état une fois traité, il écraserait sinon le nouveau.
    setTimeout(() => {
      const tache = position === null || editeur.isDestroyed ? null : editeur.state.doc.nodeAt(position);
      if (position !== null && tache !== null && tache.type.name === 'taskItem') {
        editeur.view.dispatch(editeur.state.tr.setNodeMarkup(position, undefined, { ...tache.attrs, checked: tache.attrs['checked'] !== true }));
        enregistrer();
      }
    });
  };

  /** Toucher sous le dernier bloc met le curseur en fin de page (avec un paragraphe si la page finit par une image ou un tableau). */
  const allerALaFin = (): void => {
    if (editeur === null || !modifiable) {
      return;
    }
    const dernierBloc = editeur.state.doc.lastChild;
    if (dernierBloc !== null && !dernierBloc.isTextblock) {
      editeur.chain().insertContentAt(editeur.state.doc.content.size, { type: 'paragraph' }).focus('end').run();
    } else {
      editeur.commands.focus('end');
    }
  };

  return (
    <>
      <div
        onClickCapture={surClicDeCase}
        // L'icône d'un callout ne doit pas mettre le curseur dans la page : le clavier s'ouvrirait.
        onPointerDownCapture={(evenement) => (evenement.target as HTMLElement).closest('.callout-icone') !== null && evenement.preventDefault()}
        onMouseDownCapture={(evenement) => (evenement.target as HTMLElement).closest('.callout-icone') !== null && evenement.preventDefault()}
      >
        <EditorContent editor={editeur} />
      </div>
      <div aria-hidden="true" onClick={allerALaFin} className="min-h-[35dvh] cursor-text" />
      {feuille === 'callout' && editeur !== null && <CalloutSheet editeur={editeur} fermer={() => definirFeuille(null)} />}
      {feuille === 'markdown' && editeur !== null && <MarkdownSheet editeur={editeur} fermer={() => definirFeuille(null)} />}
      {focus && feuille === null && editeur !== null && (
        <div className="marge-bas fixed inset-x-0 bottom-0 z-30 bg-surface shadow-[0_-4px_12px_rgb(0_0_0/0.25)]">
          <EditorToolbar editeur={editeur} ouvrirCallout={() => definirFeuille('callout')} ouvrirMarkdown={() => definirFeuille('markdown')} />
        </div>
      )}
    </>
  );
}
