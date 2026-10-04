import { natureDIcone } from '@notes/core';
import { lireMarkdown } from '@notes/document';
import { cheminDeLImage, classeDePage, extensionsDAffichage } from '@notes/ui';
import type { ExportOutlineEntry, MentionedPage } from '@notes/ui';
import { EditorContent, useEditor } from '@tiptap/react';
import { useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { composantLucide } from '../page-icon/PageIcon';
import { annuaireDesPages } from '../mentions/pages-directory';
import { cheminDeLaFavicon, cheminDeLIcone } from './export-images';
import { nettoyerLeRendu } from './clean-render';

interface ExportIconProps {
  icone: string | null;
  /** Dossier de la page : une icône image est dans ses `assets/`. */
  chemin: string;
  images: ReadonlyMap<string, string>;
}

/** Icône d'une page dans un export : emoji, dessin Lucide, ou image en adresse `data:`. Rien pour une valeur inconnue. */
function ExportIcon({ icone, chemin, images }: ExportIconProps) {
  const nature = natureDIcone(icone);
  if (nature?.genre === 'emoji') {
    return <span className="mention-emoji">{nature.emoji}</span>;
  }
  if (nature?.genre === 'lucide') {
    const Icone = composantLucide(nature.nom);
    return Icone === null ? null : <Icone width="1em" height="1em" aria-hidden="true" />;
  }
  const image = images.get(cheminDeLIcone(icone, chemin) ?? '');
  return image === undefined ? null : <img src={image} alt="" />;
}

interface ExportRenderProps {
  corps: string;
  dossier: string;
  icone: string | null;
  images: ReadonlyMap<string, string>;
  icones: boolean;
  surPret: () => void;
}

/** La page rendue comme à l'écran, en lecture seule, avec les images de l'export au lieu de celles du dossier des notes. */
function ExportRender({ corps, dossier, icone, images, icones, surPret }: ExportRenderProps) {
  const extensions = useMemo(() => {
    const IconeDeMention = ({ page }: { page: MentionedPage }) => <ExportIcon icone={page.icone} chemin={page.chemin} images={images} />;
    return extensionsDAffichage(
      { resoudre: (src) => images.get(cheminDeLImage(dossier, src) ?? '') ?? null },
      icones ? { pages: annuaireDesPages, Icone: IconeDeMention } : { pages: annuaireDesPages },
      { favicon: (href) => (icones ? (images.get(cheminDeLaFavicon(href) ?? '') ?? null) : null) },
    );
  }, [dossier, images, icones]);
  const contenu = useMemo(() => lireMarkdown(corps).document.toJSON() as object, [corps]);
  const editeur = useEditor({ extensions, content: contenu, editable: false, editorProps: { attributes: { class: classeDePage } }, onCreate: surPret });
  return (
    <>
      <span data-export-icone="">{icones && <ExportIcon icone={icone} chemin={dossier} images={images} />}</span>
      <EditorContent editor={editeur} />
    </>
  );
}

export interface RenderedPage {
  /** HTML intérieur du contenu de la page, nettoyé. */
  contenu: string;
  /** HTML de l'icône de la page, ou null. */
  icone: string | null;
  sommaire: ExportOutlineEntry[];
}

export interface RenderRequest {
  corps: string;
  /** Dossier de la page dans le dossier des notes. */
  dossier: string;
  icone: string | null;
  /** Images de la page, de ses mentions et des sites, par chemin dans le dossier des notes, en adresses `data:`. */
  images: ReadonlyMap<string, string>;
  icones: boolean;
  /** Adresse dans l'archive d'une page mentionnée, ou null. */
  lienVersLaPage: (id: string) => string | null;
  /** Adresse finale des images, d'après celle du rendu : les images s'affichent par leur adresse du rendu, puis sont réadressées. */
  adresseDImage?: (src: string) => string;
}

const attendre = (millisecondes: number): Promise<void> => new Promise((fin) => setTimeout(fin, millisecondes));

/**
 * Rend une page hors de l'écran, avec le même schéma, les mêmes vues et la même
 * coloration du code que l'éditeur, puis en tire le HTML d'export (README §9).
 * Rien de ce qui vient du fichier n'est interprété comme du HTML : le contenu
 * passe par le schéma, et le DOM ainsi construit est sérialisé.
 */
export async function rendrePage(demande: RenderRequest): Promise<RenderedPage> {
  const hote = document.createElement('div');
  hote.setAttribute('aria-hidden', 'true');
  hote.inert = true;
  hote.style.cssText = 'position: fixed; left: -20000px; top: 0; width: 48rem; pointer-events: none;';
  document.body.append(hote);
  const racine = createRoot(hote);
  try {
    await new Promise<void>((pret) => {
      racine.render(<ExportRender corps={demande.corps} dossier={demande.dossier} icone={demande.icone} images={demande.images} icones={demande.icones} surPret={pret} />);
    });
    // La vue est posée dans la page par EditorContent, et les mentions (vues React) un peu après la création de l'éditeur.
    let mentions = 0;
    lireMarkdown(demande.corps).document.descendants((noeud) => {
      mentions += noeud.type.name === 'pageMention' ? 1 : 0;
    });
    const rendue = (): boolean => hote.querySelector(`.${classeDePage}`) !== null && hote.querySelectorAll('.mention-titre').length >= mentions;
    for (let essai = 0; essai < 100 && !rendue(); essai += 1) {
      await attendre(20);
    }
    await attendre(0);
    const page = hote.querySelector<HTMLElement>(`.${classeDePage}`);
    if (page === null) {
      throw new Error("La page n'a pas pu être rendue.");
    }
    const { html, sommaire } = nettoyerLeRendu(page, {
      icones: demande.icones,
      lienVersLaPage: demande.lienVersLaPage,
      ...(demande.adresseDImage === undefined ? {} : { adresseDImage: demande.adresseDImage }),
    });
    const icone = hote.querySelector('[data-export-icone]')?.innerHTML ?? '';
    return { contenu: html, icone: icone === '' ? null : icone, sommaire };
  } finally {
    racine.unmount();
    hote.remove();
  }
}
