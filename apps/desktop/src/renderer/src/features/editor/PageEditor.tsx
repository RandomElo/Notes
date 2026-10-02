import type { TreeNode } from '@notes/core';
import { ecrireMarkdown, extensionsDuSchema, lireMarkdown } from '@notes/document';
import { classeDePage, variablesDeSurcharge } from '@notes/ui';
import { Dropcursor, Gapcursor, Placeholder, UndoRedo } from '@tiptap/extensions';
import { EditorContent, useEditor } from '@tiptap/react';
import type { Theme } from '@notes/ui';
import type { Editor } from '@tiptap/react';
import { X } from 'lucide-react';
import { Selection } from '@tiptap/pm/state';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { api } from '../../lib/ipc';
import { BlockHandle } from '../blocks/BlockHandle';
import { BlockKeys } from '../blocks/block-extension';
import { SlashMenu } from '../slash-menu/SlashMenu';
import { SlashKeys } from '../slash-menu/slash-extension';
import { FloatingToolbar } from '../toolbar/FloatingToolbar';
import { PageSaver } from './page-saver';
import type { SaveState } from './page-saver';
import { PageTitle } from './PageTitle';
import { inscrireVidage } from './pending-saves';
import { SaveIndicator } from './SaveIndicator';

/** Temps sans frappe avant l'enregistrement automatique. */
const delaiEnregistrementMs = 800;
const delaiDeRepriseMs = 5000;

// Ce que l'éditeur ajoute au schéma partagé : gestion des blocs au clavier, menu « / », annuler et rétablir,
// curseur entre deux blocs, repère de dépôt, invite.
const extensions = [
  ...extensionsDuSchema,
  BlockKeys,
  SlashKeys,
  UndoRedo,
  Gapcursor,
  Dropcursor.configure({ color: 'var(--color-accent)', width: 2 }),
  Placeholder.configure({
    placeholder: 'Écris ici, ou tape / pour choisir un bloc',
  }),
];

type Chargement = { etat: 'lecture' } | { etat: 'pret'; corps: string; surcharges: Record<string, string> } | { etat: 'erreur'; message: string };

interface PageEditorProps {
  /** La page ouverte. Le composant est recréé quand on change de page (clé = identifiant). */
  noeud: TreeNode;
  /** Renomme la page ouverte. Rend le message d'erreur en cas d'échec, null sinon. */
  surRenommage: (titre: string) => Promise<string | null>;
  /** Crée une sous-page de la page ouverte (commande « Page enfant » du menu « / »). */
  surSousPage: () => void;
  /** Vrai quand le curseur doit aller dans le contenu (page qui vient d'être créée et nommée). */
  entrer: boolean;
  surEntree: () => void;
  /** Le thème appliqué : les couleurs propres à la page s'y ajoutent. */
  theme: Theme;
}

/** Page ouverte : fil d'Ariane, titre, puis l'éditeur de son contenu. */
export function PageEditor({ noeud, surRenommage, surSousPage, entrer, surEntree, theme }: PageEditorProps) {
  // Entrée ou flèche bas dans le titre : le curseur passe au début du contenu.
  const [descentes, descendre] = useState(0);
  const [chargement, definirChargement] = useState<Chargement>({ etat: 'lecture' });
  const [enregistrement, definirEnregistrement] = useState<SaveState>({
    genre: 'enregistre',
  });
  const cheminDeDepart = useRef(noeud.chemin);

  useEffect(() => {
    let actif = true;
    void api.lirePage({ chemin: cheminDeDepart.current }).then((lu) => {
      if (actif) {
        definirChargement(lu.ok ? { etat: 'pret', corps: lu.corps, surcharges: lu.surcharges } : { etat: 'erreur', message: lu.erreur.message });
      }
    });
    return () => {
      actif = false;
    };
  }, []);

  // Couleurs propres à cette page (`theme_overrides` du front-matter) : posées sur son conteneur, elles ne
  // débordent pas sur l'arborescence. Ce qui n'est pas une couleur de la palette est ignoré.
  const surcharges = chargement.etat === 'pret' ? chargement.surcharges : null;
  const couleurs = useMemo(() => (surcharges === null ? {} : variablesDeSurcharge(surcharges, theme).variables), [surcharges, theme]);
  const surSurcharges = useMemo(
    () => (recues: Record<string, string>) =>
      definirChargement((actuel) =>
        actuel.etat === 'pret' && JSON.stringify(actuel.surcharges) !== JSON.stringify(recues) ? { ...actuel, surcharges: recues } : actuel,
      ),
    [],
  );

  return (
    <div style={couleurs as CSSProperties} className="bg-fond text-texte -mx-6 min-h-full px-6">
      <article className="mx-auto max-w-(--ui-largeur-contenu) pb-24">
        {/* Reste visible quand la page défile : c'est là que s'affiche le résultat de l'enregistrement. */}
        <div className="bg-fond sticky top-0 z-10 -mx-2 flex items-center justify-between gap-4 px-2 py-2">
          <p className="text-discret min-w-0 truncate text-xs">{noeud.chemin.split('/').join(' / ')}</p>
          {chargement.etat === 'pret' && <SaveIndicator etat={enregistrement} />}
        </div>
        {/* Le titre de la page est le niveau 1 : dans le contenu, `#` est le premier niveau en dessous. */}
        <PageTitle titre={noeud.titre} surRenommage={surRenommage} surDescente={() => descendre((compte) => compte + 1)} />

        {chargement.etat === 'erreur' && (
          <p role="alert" className="bg-erreur/10 rounded-md p-3 text-sm">
            Cette page n'a pas pu être lue : {chargement.message}
          </p>
        )}
        {chargement.etat === 'pret' && (
          <EditorSurface
            corps={chargement.corps}
            chemin={noeud.chemin}
            surEtat={definirEnregistrement}
            surSousPage={surSousPage}
            descentes={descentes}
            entrer={entrer}
            surEntree={surEntree}
            surSurcharges={surSurcharges}
          />
        )}
      </article>
    </div>
  );
}

interface EditorSurfaceProps {
  corps: string;
  /** Chemin actuel de la page : il change si elle est renommée ou déplacée pendant qu'elle est ouverte. */
  chemin: string;
  surEtat: (etat: SaveState) => void;
  surSousPage: () => void;
  /** Augmente chaque fois que le titre passe la main au contenu. */
  descentes: number;
  entrer: boolean;
  surEntree: () => void;
  /** Les surcharges de thème relues quand le fichier change sur le disque. */
  surSurcharges: (surcharges: Record<string, string>) => void;
}

function EditorSurface({ corps, chemin, surEtat, surSousPage, descentes, entrer, surEntree, surSurcharges }: EditorSurfaceProps) {
  const [conflit, definirConflit] = useState<string | null>(null);
  const depart = useMemo(() => lireMarkdown(corps), [corps]);
  // Texte d'origine de chaque bloc : c'est ce qui permet de ne réécrire que les blocs modifiés.
  const source = useRef(depart.source);
  const cheminActuel = useRef(chemin);
  const editeurActuel = useRef<Editor | null>(null);
  useEffect(() => {
    cheminActuel.current = chemin;
  }, [chemin]);

  const sauvegarde = useMemo(
    () =>
      new PageSaver({
        corpsDeBase: corps,
        delaiMs: delaiEnregistrementMs,
        delaiDeRepriseMs,
        lireCorps: () => (editeurActuel.current === null ? corps : ecrireMarkdown(editeurActuel.current.state.doc, source.current)),
        enregistrer: (nouveau, corpsDeBase) =>
          api.enregistrerPage({
            chemin: cheminActuel.current,
            corps: nouveau,
            corpsDeBase,
          }),
        surEtat,
        surEnregistre: (ecrit, sauvegardeDeConflit) => {
          source.current = lireMarkdown(ecrit).source;
          if (sauvegardeDeConflit !== null) {
            definirConflit(sauvegardeDeConflit);
          }
        },
      }),
    [corps, surEtat],
  );

  const editeur = useEditor({
    extensions,
    content: depart.document.toJSON() as object,
    editorProps: {
      attributes: {
        class: `${classeDePage} min-h-64`,
        'aria-label': 'Contenu de la page',
        spellcheck: 'false',
      },
      // Flèche haut tout au début du contenu : le curseur remonte dans le titre de la page.
      handleKeyDown: (vue, evenement) => {
        const { selection, doc } = vue.state;
        if (evenement.key !== 'ArrowUp' || evenement.shiftKey || evenement.ctrlKey || !selection.empty || selection.from !== Selection.atStart(doc).from) {
          return false;
        }
        const titre = vue.dom.closest('article')?.querySelector<HTMLElement>('.titre-de-page');
        if (titre === null || titre === undefined) {
          return false;
        }
        titre.focus();
        window.getSelection()?.selectAllChildren(titre);
        window.getSelection()?.collapseToEnd();
        return true;
      },
    },
    onUpdate: () => sauvegarde.signalerModification(),
  });
  useEffect(() => {
    editeurActuel.current = editeur;
  }, [editeur]);

  useEffect(() => {
    if (descentes > 0) {
      editeur.commands.focus('start');
    }
  }, [descentes, editeur]);

  // Après l'arborescence, qui reprend le focus à la fin du renommage : les effets d'un même rendu vont dans l'ordre de l'arbre.
  useEffect(() => {
    if (entrer) {
      editeur.commands.focus('start');
      surEntree();
    }
  }, [entrer, editeur, surEntree]);

  // Changement de page ou fermeture de la fenêtre : ce qui n'est pas enregistré l'est tout de suite.
  useEffect(() => {
    sauvegarde.demarrer();
    const retirer = inscrireVidage(() => sauvegarde.vider());
    return () => {
      retirer();
      void sauvegarde.vider();
      sauvegarde.arreter();
    };
  }, [sauvegarde]);

  // Le fichier a changé sur le disque (autre outil, sync) : la page est rechargée, sauf si une frappe attend
  // d'être enregistrée. Dans ce cas c'est l'enregistrement qui garde l'autre version en sauvegarde de conflit.
  useEffect(
    () =>
      api.surVaultModifie(() => {
        if (sauvegarde.aDesModifications()) {
          return;
        }
        void api.lirePage({ chemin: cheminActuel.current }).then((lu) => {
          if (lu.ok && !editeur.isDestroyed) {
            surSurcharges(lu.surcharges);
          }
          if (!lu.ok || lu.corps === sauvegarde.base || sauvegarde.aDesModifications() || editeur.isDestroyed) {
            return;
          }
          const relu = lireMarkdown(lu.corps);
          source.current = relu.source;
          sauvegarde.remplacerBase(lu.corps);
          editeur.commands.setContent(relu.document.toJSON() as object, {
            emitUpdate: false,
          });
        });
      }),
    [editeur, sauvegarde, surSurcharges],
  );

  return (
    <>
      {conflit !== null && (
        <div role="alert" className="bg-alerte/15 mb-4 flex items-start gap-3 rounded-md p-3 text-sm">
          <p className="flex-1">
            Cette page a été modifiée ailleurs pendant que tu écrivais. Ta version est enregistrée. L'autre est gardée à côté, dans le dossier de la page, sous le nom{' '}
            <span className="font-mono text-xs">{conflit}</span>.
          </p>
          <button
            type="button"
            onClick={() => definirConflit(null)}
            aria-label="Fermer le message"
            className="text-discret hover:bg-texte/10 hover:text-texte shrink-0 rounded p-0.5"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      )}
      <EditorContent editor={editeur} />
      <BlockHandle editor={editeur} />
      <FloatingToolbar editor={editeur} />
      <SlashMenu editor={editeur} surSousPage={surSousPage} />
    </>
  );
}
