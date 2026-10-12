import { ecrireMarkdown, lireMarkdown } from '@notes/document';
import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { useMemo, useState } from 'react';
import { Sheet } from '../../components/Sheet';
import { brancherFermeture } from '../quick-edit/auto-pairs';

/**
 * Le Markdown du bloc du curseur, à modifier à la main (demande d'Eloi,
 * 0.15.7 : ce que faisait l'appui long). Vidé, le bloc est retiré ; une
 * ligne vide le coupe en plusieurs blocs.
 */
export function MarkdownSheet({ editeur, fermer }: { editeur: Editor; fermer: () => void }) {
  // Le bloc de premier niveau du curseur, relevé à l'ouverture.
  const bloc = useMemo(() => {
    const { $from } = editeur.state.selection;
    const rang = $from.index(0);
    const noeud = editeur.state.doc.maybeChild(rang);
    if (noeud === null) {
      return null;
    }
    const debut = $from.depth === 0 ? $from.posAtIndex(rang) : $from.before(1);
    const markdown = ecrireMarkdown(editeur.state.doc.type.schema.nodes['doc']!.create(null, noeud)).replace(/\r?\n+$/, '');
    return { debut, fin: debut + noeud.nodeSize, markdown };
  }, [editeur]);
  const [texte, definirTexte] = useState(bloc?.markdown ?? '');
  if (bloc === null) {
    return null;
  }

  const enregistrer = (): void => {
    const lu = lireMarkdown(texte.trim() === '' ? '' : `${texte.trim()}\n`).document;
    const blocs: ProseMirrorNode[] = [];
    lu.forEach((noeud) => blocs.push(editeur.schema.nodeFromJSON(noeud.toJSON())));
    const vide = blocs.length === 1 && blocs[0]!.type.name === 'paragraph' && blocs[0]!.content.size === 0;
    const tr = editeur.state.tr;
    if (vide && editeur.state.doc.childCount > 1) {
      tr.delete(bloc.debut, bloc.fin);
    } else {
      tr.replaceWith(bloc.debut, bloc.fin, blocs);
    }
    editeur.view.dispatch(tr);
    fermer();
  };

  return (
    <Sheet titre="Markdown du bloc" fermer={fermer} haute>
      <div className="flex min-h-0 flex-1 flex-col gap-2 px-5 pb-2">
        <textarea
          ref={brancherFermeture}
          value={texte}
          autoFocus
          spellCheck
          onChange={(evenement) => definirTexte(evenement.target.value)}
          className="min-h-0 flex-1 resize-none rounded-lg bg-texte/10 px-3 py-2.5 font-mono text-[0.95rem] outline-none focus:bg-texte/15"
        />
        <p className="text-xs text-discret">« # » pour un titre, « - » pour une puce, une ligne vide pour couper en deux. Vide, le bloc est retiré.</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={fermer} className="rounded-lg px-4 py-2.5 outline-none active:bg-texte/10 focus-visible:bg-texte/15">
            Annuler
          </button>
          <button type="button" onClick={enregistrer} className="rounded-lg bg-accent px-4 py-2.5 font-medium text-fond outline-none active:bg-accent/80">
            Enregistrer
          </button>
        </div>
      </div>
    </Sheet>
  );
}
