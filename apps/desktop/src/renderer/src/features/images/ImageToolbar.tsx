import { largeurMaxDImage, taillesDImage } from '@notes/document';
import type { ImageAlign, ImageAttributes } from '@notes/document';
import { NodeSelection } from '@tiptap/pm/state';
import type { Editor } from '@tiptap/react';
import { AlignCenter, AlignLeft, AlignRight, Captions, Maximize2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';

const alignements: { valeur: ImageAlign; libelle: string; icone: LucideIcon }[] = [
  { valeur: 'gauche', libelle: 'À gauche', icone: AlignLeft },
  { valeur: 'centre', libelle: 'Centrée', icone: AlignCenter },
  { valeur: 'droite', libelle: 'À droite', icone: AlignRight },
];

/** Texte sur une ligne, sans espaces au bord : c'est ce que le fichier gardera. */
const surUneLigne = (texte: string): string => texte.replace(/\s+/g, ' ').trim();

interface ImageToolbarProps {
  editor: Editor;
  surAgrandir: (attributs: ImageAttributes) => void;
}

/**
 * Barre d'outils d'une image sélectionnée (docs/spec/editeur.md) : taille (Petit, Moyen,
 * Grand ; une autre largeur se règle par les bords de l'image, voir
 * ImageResizeHandles), alignement, texte alternatif et légende, visionneuse. Grand (toute la page) et le centrage sont les valeurs par
 * défaut : rien n'est écrit dans le fichier pour elles.
 */
export function ImageToolbar({ editor, surAgrandir }: ImageToolbarProps) {
  const [, rafraichir] = useReducer((compteur: number) => compteur + 1, 0);
  const [textesOuverts, definirTextesOuverts] = useState(false);
  const [position, definirPosition] = useState<{ gauche: number; haut: number } | null>(null);
  const barre = useRef<HTMLDivElement>(null);

  useEffect(() => {
    editor.on('transaction', rafraichir);
    window.addEventListener('scroll', rafraichir, true);
    window.addEventListener('resize', rafraichir);
    return () => {
      editor.off('transaction', rafraichir);
      window.removeEventListener('scroll', rafraichir, true);
      window.removeEventListener('resize', rafraichir);
    };
  }, [editor]);

  const selection = editor.isDestroyed ? null : editor.state.selection;
  const image = selection instanceof NodeSelection && selection.node.type.name === 'image' && editor.isEditable ? selection : null;
  const de = image?.from ?? null;

  useEffect(() => definirTextesOuverts(false), [de]);

  useLayoutEffect(() => {
    const element = de === null ? null : editor.view.nodeDOM(de);
    if (!(element instanceof HTMLElement) || barre.current === null) {
      definirPosition(null);
      return;
    }
    const cadre = (element.querySelector('img:not([hidden])') ?? element).getBoundingClientRect();
    const { offsetWidth: largeur, offsetHeight: hauteur } = barre.current;
    const haut = cadre.top - hauteur - 8 < 96 ? Math.min(cadre.bottom + 8, window.innerHeight - hauteur - 8) : cadre.top - hauteur - 8;
    const gauche = Math.max(8, Math.min(cadre.left + cadre.width / 2 - largeur / 2, window.innerWidth - largeur - 8));
    definirPosition((actuelle) => (actuelle?.gauche === gauche && actuelle.haut === haut ? actuelle : { gauche, haut }));
  });

  if (image === null || de === null) {
    return null;
  }
  const attributs = image.node.attrs as ImageAttributes;
  const regler = (changement: Partial<ImageAttributes>): void => {
    editor.chain().command(({ tr }) => {
      tr.setNodeMarkup(de, null, { ...attributs, ...changement });
      tr.setSelection(NodeSelection.create(tr.doc, de));
      return true;
    }).run();
  };
  const sansFocus = (evenement: { preventDefault(): void }): void => evenement.preventDefault();
  const largeur = attributs.largeur ?? largeurMaxDImage;
  const bouton = (actif: boolean): string => `flex h-7 min-w-7 items-center justify-center rounded px-1.5 text-sm ${actif ? 'bg-accent/25' : 'hover:bg-texte/10'}`;

  return (
    <div
      ref={barre}
      role="toolbar"
      aria-label="Image"
      style={{ left: position?.gauche ?? 0, top: position?.haut ?? 0, visibility: position === null ? 'hidden' : 'visible' }}
      className="border-bordure bg-surface fixed z-30 flex items-center gap-0.5 rounded-md border p-1 shadow-xl shadow-black/40"
    >
      {taillesDImage.map((taille) => {
        const active = largeur === taille.largeur;
        return (
          <button
            key={taille.nom}
            type="button"
            title={`${taille.nom} (${taille.largeur} % de la page)`}
            aria-pressed={active}
            onMouseDown={sansFocus}
            onClick={() => regler({ largeur: taille.largeur === largeurMaxDImage ? null : taille.largeur })}
            className={bouton(active)}
          >
            {taille.nom}
          </button>
        );
      })}
      <span className="bg-bordure mx-1 h-5 w-px" aria-hidden="true" />
      {alignements.map((alignement) => {
        const active = (attributs.alignement ?? 'centre') === alignement.valeur;
        return (
          <button
            key={alignement.valeur}
            type="button"
            title={alignement.libelle}
            aria-label={alignement.libelle}
            aria-pressed={active}
            onMouseDown={sansFocus}
            onClick={() => regler({ alignement: alignement.valeur === 'centre' ? null : alignement.valeur })}
            className={bouton(active)}
          >
            <alignement.icone className="size-4" aria-hidden="true" />
          </button>
        );
      })}
      <span className="bg-bordure mx-1 h-5 w-px" aria-hidden="true" />
      <div className="relative">
        <button
          type="button"
          title="Texte alternatif et légende"
          aria-label="Texte alternatif et légende"
          aria-expanded={textesOuverts}
          onMouseDown={sansFocus}
          onClick={() => definirTextesOuverts((ouvert) => !ouvert)}
          className={bouton(textesOuverts)}
        >
          <Captions className="size-4" aria-hidden="true" />
        </button>
        {textesOuverts && (
          <ImageTexts
            attributs={attributs}
            surValidation={(alt, legende) => {
              definirTextesOuverts(false);
              regler({ alt: surUneLigne(alt), title: surUneLigne(legende) === '' ? null : surUneLigne(legende) });
              editor.commands.focus();
            }}
            surAnnulation={() => {
              definirTextesOuverts(false);
              editor.commands.focus();
            }}
          />
        )}
      </div>
      <button type="button" title="Agrandir (double-clic)" aria-label="Agrandir" onMouseDown={sansFocus} onClick={() => surAgrandir(attributs)} className={bouton(false)}>
        <Maximize2 className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

interface ImageTextsProps {
  attributs: ImageAttributes;
  surValidation: (alt: string, legende: string) => void;
  surAnnulation: () => void;
}

/** Texte alternatif (lu à la place de l'image) et légende (affichée dessous). Entrée valide, Échap annule. */
function ImageTexts({ attributs, surValidation, surAnnulation }: ImageTextsProps) {
  const [alt, definirAlt] = useState(attributs.alt);
  const [legende, definirLegende] = useState(attributs.title ?? '');
  const champ = 'bg-texte/5 focus:bg-texte/10 mt-1 w-full rounded px-2 py-1 text-sm outline-0';
  return (
    <form
      className="border-bordure bg-surface absolute top-full right-0 z-30 mt-1 w-72 space-y-2 rounded-md border p-3 shadow-xl shadow-black/40"
      onSubmit={(evenement) => {
        evenement.preventDefault();
        surValidation(alt, legende);
      }}
      onKeyDown={(evenement) => {
        if (evenement.key === 'Escape') {
          evenement.preventDefault();
          evenement.stopPropagation();
          surAnnulation();
        }
      }}
    >
      <label className="block text-xs">
        <span className="text-discret">Texte alternatif</span>
        <input autoFocus value={alt} onChange={(evenement) => definirAlt(evenement.target.value)} placeholder="Ce que montre l'image" className={champ} />
      </label>
      <label className="block text-xs">
        <span className="text-discret">Légende</span>
        <input value={legende} onChange={(evenement) => definirLegende(evenement.target.value)} placeholder="Affichée sous l'image" className={champ} />
      </label>
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={surAnnulation} className="hover:bg-texte/10 rounded px-2 py-1 text-sm">
          Annuler
        </button>
        <button type="submit" className="bg-accent/25 hover:bg-accent/40 rounded px-2 py-1 text-sm">
          Valider
        </button>
      </div>
    </form>
  );
}
