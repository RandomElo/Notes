import { PageMention } from '@notes/document';
import type { PageMentionAttributes } from '@notes/document';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { useSyncExternalStore } from 'react';
import type { ComponentType, MouseEvent } from 'react';

/** Ce qu'une mention affiche de la page visée. */
export interface MentionedPage {
  titre: string;
  icone: string | null;
  /** Dossier de la page : une icône image est dans ses `assets/`. */
  chemin: string;
}

/** Les pages du dossier des notes, tenues à jour par l'application. */
export interface PagesDirectory {
  /** La page d'identifiant « id », ou null si elle n'existe pas. Même objet tant qu'elle ne change pas. */
  lire: (id: string) => MentionedPage | null;
  /** Prévient l'écouteur à chaque changement de l'arborescence. Rend le désabonnement. */
  abonner: (ecouteur: () => void) => () => void;
}

export interface MentionViewOptions {
  /** Absent : on ne sait rien des pages, la mention montre le texte du fichier, sans le barrer. */
  pages?: PagesDirectory;
  /** Icône d'une page, dessinée par l'application. Absente : pas d'icône. */
  Icone?: ComponentType<{ page: MentionedPage }>;
  /** Ouvre la page visée. « nouvelOnglet » : Ctrl+clic ou clic du milieu. Absent : la mention ne s'ouvre pas. */
  ouvrir?: (id: string, nouvelOnglet: boolean) => void;
}

/** Sans annuaire des pages : rien n'est connu, rien n'est barré. */
const sansAnnuaire = { lire: () => undefined, abonner: () => () => undefined };

/**
 * Une mention à l'écran (docs/spec/editeur.md) : l'icône et le titre courant de la
 * page, pas le texte du fichier. Si la page n'existe pas, le texte du fichier
 * barré. Tout est posé comme texte par React, rien n'est interprété.
 */
function MentionView({ node, extension }: NodeViewProps) {
  const options = extension.options as MentionViewOptions;
  const { id, libelle } = node.attrs as PageMentionAttributes;
  const pages: { lire: (id: string) => MentionedPage | null | undefined; abonner: PagesDirectory['abonner'] } = options.pages ?? sansAnnuaire;
  const trouvee = useSyncExternalStore(pages.abonner, () => pages.lire(id));
  const page = trouvee ?? null;
  const cassee = trouvee === null;
  const ouvrir = (evenement: MouseEvent): void => {
    if (options.ouvrir === undefined || page === null || (evenement.button !== 0 && evenement.button !== 1)) {
      return;
    }
    evenement.preventDefault();
    options.ouvrir(id, evenement.ctrlKey || evenement.metaKey || evenement.button === 1);
  };
  const { Icone } = options;
  return (
    <NodeViewWrapper
      as="span"
      className="mention"
      data-mention={id}
      data-cassee={cassee ? '' : undefined}
      title={cassee ? `Page introuvable : ${libelle}` : undefined}
      onClick={ouvrir}
      onAuxClick={ouvrir}
    >
      {page !== null && Icone !== undefined && <Icone page={page} />}
      <span className="mention-titre">{page?.titre ?? (libelle === '' && cassee ? 'Page introuvable' : libelle)}</span>
    </NodeViewWrapper>
  );
}

/** Le nœud de mention du schéma, avec sa vue. */
export function mentionAvecVue(options: MentionViewOptions) {
  return PageMention.extend<MentionViewOptions>({
    addOptions: () => options,
    addNodeView() {
      return ReactNodeViewRenderer(MentionView, { as: 'span' });
    },
  });
}
