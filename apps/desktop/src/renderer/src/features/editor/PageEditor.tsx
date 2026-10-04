import { natureDIcone } from '@notes/core';
import type { TreeNode } from '@notes/core';
import { ecrireMarkdown, libelleDAdresse, lireMarkdown, mentionsARenommer } from '@notes/document';
import type { ImageAttributes, OutlineEntry } from '@notes/document';
import { classeDePage, extensionsDAffichage, variablesDeSurcharge } from '@notes/ui';
import { Node as NoeudTiptap } from '@tiptap/core';
import type { AnyExtension } from '@tiptap/core';
import { Dropcursor, Gapcursor, Placeholder, UndoRedo } from '@tiptap/extensions';
import { EditorContent, ReactNodeViewRenderer, useEditor } from '@tiptap/react';
import type { MentionedPage, Theme } from '@notes/ui';
import type { Editor } from '@tiptap/react';
import { FileText, List, Lock, X } from 'lucide-react';
import { Selection } from '@tiptap/pm/state';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { api } from '../../lib/ipc';
import { BlockHandle } from '../blocks/BlockHandle';
import { BlockKeys } from '../blocks/block-extension';
import { CodeBlockView } from '../code-block/CodeBlockView';
import { CodePaste } from '../code-block/code-paste';
import { ConflictNotice, useConflits } from '../conflicts/ConflictNotice';
import { ImageCopy } from '../images/image-copy';
import { ImageFiles, ajouterEnWebp } from '../images/image-files';
import { ImageLinkPrompt } from '../images/ImageLinkPrompt';
import { ImageResizeHandles } from '../images/ImageResizeHandles';
import { adresseDImage } from '../images/image-url';
import { ImageToolbar } from '../images/ImageToolbar';
import { ImageViewer } from '../images/ImageViewer';
import { insererImages } from '../images/insert-images';
import { LinkBehaviour } from '../links/link-extension';
import type { LinkOptions } from '../links/link-extension';
import { LinkTooltip } from '../links/LinkTooltip';
import { adresseDeFavicon, mentionnerLeSite } from '../links/site-mention';
import { MentionKeys } from '../mentions/mention-extension';
import { MentionMenu } from '../mentions/MentionMenu';
import { annuaireDesPages } from '../mentions/pages-directory';
import { inscrireEditeurOuvert } from '../mentions/rename-follow';
import { PageHeaderIcon } from '../page-icon/PageHeaderIcon';
import { PageIcon } from '../page-icon/PageIcon';
import { SlashMenu } from '../slash-menu/SlashMenu';
import { SlashKeys } from '../slash-menu/slash-extension';
import type { SlashActions } from '../slash-menu/slash-extension';
import { TableGridPicker } from '../tables/TableGridPicker';
import { RowColumnGrips } from '../tables/RowColumnGrips';
import { TableHandles } from '../tables/TableHandles';
import { TableKeys } from '../tables/table-keys';
import { OutlineDialog } from '../outline/OutlineDialog';
import { OutlineRail } from '../outline/OutlineRail';
import { allerAuTitre, useOutline } from '../outline/useOutline';
import { FloatingToolbar } from '../toolbar/FloatingToolbar';
import { allerALaFin } from './end-click';
import { PageSaver } from './page-saver';
import type { SaveState } from './page-saver';
import { PageTitle } from './PageTitle';
import { inscrireVidage } from './pending-saves';
import { SaveIndicator } from './SaveIndicator';
import { usePageLock } from './usePageLock';

/** Temps sans frappe avant l'enregistrement automatique. */
const delaiEnregistrementMs = 800;
const delaiDeRepriseMs = 5000;

interface ExtensionsDeLEditeur {
  /** Chemin actuel de la page, lu au moment où il sert (la page peut être renommée pendant qu'elle est ouverte). */
  chemin: () => string;
  agrandir: (attributs: ImageAttributes, adresse: string) => void;
  surErreurDImage: (message: string) => void;
  surLienDImage: (adresse: string, position: number) => void;
  /** Ouverture d'une page par un lien ou une mention, et titre d'une page pour un lien collé. */
  liens: LinkOptions;
}

/** Icône d'une page mentionnée : celle de la page, sinon une page blanche. */
function IconeDeMention({ page }: { page: MentionedPage }) {
  return <PageIcon icone={page.icone} chemin={page.chemin} defaut={<FileText className="inline size-[1em]" aria-hidden="true" />} />;
}

/**
 * Ce que l'éditeur ajoute au schéma partagé et à son affichage : barre des
 * blocs de code, gestion des blocs au clavier, menu « / », tableaux, images
 * collées ou déposées, annuler et rétablir, curseur entre deux blocs, repère
 * de dépôt, invite.
 */
function extensionsDeLEditeur({ chemin, agrandir, surErreurDImage, surLienDImage, liens }: ExtensionsDeLEditeur): AnyExtension[] {
  const affichage = extensionsDAffichage(
    { resoudre: (src) => adresseDImage(chemin(), src), agrandir },
    { pages: annuaireDesPages, Icone: IconeDeMention, ouvrir: liens.ouvrirPage },
    { favicon: adresseDeFavicon },
  );
  return [
    ...affichage.map((extension) =>
      extension instanceof NoeudTiptap && extension.name === 'codeBlock' ? extension.extend({ addNodeView: () => ReactNodeViewRenderer(CodeBlockView) }) : extension,
    ),
    BlockKeys,
    SlashKeys,
    MentionKeys,
    TableKeys,
    CodePaste,
    ImageFiles.configure({ chemin, surErreur: surErreurDImage, surLienDImage }),
    ImageCopy.configure({ chemin, surErreur: surErreurDImage }),
    // Après les images : un lien d'image collé leur revient.
    LinkBehaviour.configure(liens),
    UndoRedo,
    Gapcursor,
    Dropcursor.configure({ color: 'var(--color-accent)', width: 2 }),
    Placeholder.configure({
      placeholder: 'Écris ici, ou tape / pour choisir un bloc',
    }),
  ];
}

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
  /** Ouvre l'écran de résolution d'une version en conflit de cette page. */
  surConflit: (sauvegarde: string) => void;
  /** Sommaire latéral affiché (Ctrl+Maj+\ le masque). */
  sommaireVisible: boolean;
  /** Ouvre une page depuis un lien ou une mention. « nouvelOnglet » : Ctrl+clic ou clic du milieu. */
  surOuvrirPage: (id: string, nouvelOnglet: boolean) => void;
  /** Ouvre le choix de l'icône de la page sous ce point. */
  surIcone: (x: number, y: number) => void;
}

/** Page ouverte : fil d'Ariane, titre, puis l'éditeur de son contenu. */
export function PageEditor({ noeud, surRenommage, surSousPage, entrer, surEntree, theme, surConflit, sommaireVisible, surOuvrirPage, surIcone }: PageEditorProps) {
  // Entrée ou flèche bas dans le titre : le curseur passe au début du contenu.
  const [descentes, descendre] = useState(0);
  const [chargement, definirChargement] = useState<Chargement>({ etat: 'lecture' });
  const [enregistrement, definirEnregistrement] = useState<SaveState>({
    genre: 'enregistre',
  });
  const cheminDeDepart = useRef(noeud.chemin);
  const verrou = usePageLock(noeud.chemin);
  const lectureSeule = verrou.verrou.etat === 'autre';
  const conflits = useConflits(noeud.chemin);
  const [editeur, definirEditeur] = useState<Editor | null>(null);
  const sommaire = useOutline(editeur);
  const [sommaireOuvert, definirSommaireOuvert] = useState(false);
  const allerA = (entree: OutlineEntry): void => {
    definirSommaireOuvert(false);
    if (editeur !== null && !editeur.isDestroyed) {
      allerAuTitre(editeur, entree);
    }
  };

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
    <div data-zone-page style={couleurs as CSSProperties} className="bg-fond text-texte -mr-6 -ml-12 flex min-h-full pr-6 pl-12">
      <article className="mx-auto max-w-(--ui-largeur-contenu) min-w-0 flex-1 pb-24">
        {/* Reste visible quand la page défile : c'est là que s'affiche le résultat de l'enregistrement. */}
        <div className="bg-fond sticky top-0 z-10 -mx-2 flex items-center justify-between gap-4 px-2 py-2">
          <p className="text-discret min-w-0 truncate text-xs">{noeud.chemin.split('/').join(' / ')}</p>
          <div className="flex shrink-0 items-center gap-2">
            {chargement.etat === 'pret' && <SaveIndicator etat={enregistrement} />}
            <button
              type="button"
              onClick={() => definirSommaireOuvert(true)}
              aria-label="Sommaire de la page"
              title="Sommaire de la page"
              className="text-discret hover:bg-texte/10 hover:text-texte focus-visible:bg-texte/20 focus-visible:text-texte flex size-6 items-center justify-center rounded outline-0"
            >
              <List className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
        {/* Le titre de la page est le niveau 1 : dans le contenu, `#` est le premier niveau en dessous. */}
        <div className={`group/entete ${natureDIcone(noeud.icone) === null ? 'pt-3.5' : 'pt-6'}`}>
          <PageHeaderIcon icone={noeud.icone} chemin={noeud.chemin} lectureSeule={lectureSeule} surOuverture={surIcone} />
          <PageTitle titre={noeud.titre} surRenommage={surRenommage} surDescente={() => descendre((compte) => compte + 1)} lectureSeule={lectureSeule} />
        </div>

        {verrou.verrou.etat === 'autre' && <LockNotice nom={verrou.verrou.nom} surForcage={verrou.forcer} />}
        <ConflictNotice conflits={conflits} surResolution={surConflit} />

        {chargement.etat === 'erreur' && (
          <p role="alert" className="bg-erreur/10 rounded-md p-3 text-sm">
            Cette page n'a pas pu être lue : {chargement.message}
          </p>
        )}
        {chargement.etat === 'pret' && (
          <EditorSurface
            corps={chargement.corps}
            id={noeud.id ?? ''}
            chemin={noeud.chemin}
            surOuvrirPage={surOuvrirPage}
            surEtat={definirEnregistrement}
            surSousPage={surSousPage}
            descentes={descentes}
            entrer={entrer}
            surEntree={surEntree}
            surSurcharges={surSurcharges}
            lectureSeule={lectureSeule}
            surFrappe={verrou.signalerFrappe}
            surEditeur={definirEditeur}
          />
        )}
      </article>
      {sommaireVisible && <OutlineRail entrees={sommaire.entrees} courant={sommaire.courant} surChoix={allerA} />}
      {sommaireOuvert && (
        <OutlineDialog
          titre={noeud.titre}
          entrees={sommaire.entrees}
          courant={sommaire.courant}
          surChoix={allerA}
          surFermeture={() => {
            definirSommaireOuvert(false);
            editeur?.commands.focus(undefined, { scrollIntoView: false });
          }}
        />
      )}
    </div>
  );
}

interface EditorSurfaceProps {
  corps: string;
  /** Identifiant de la page : son éditeur suit le renommage des pages qu'elle mentionne. */
  id: string;
  surOuvrirPage: (id: string, nouvelOnglet: boolean) => void;
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
  /** Un autre appareil édite la page : on la lit sans pouvoir la modifier. */
  lectureSeule: boolean;
  /** Appelé à chaque modification du contenu, pour le verrou de la page. */
  surFrappe: () => void;
  /** Donne l'éditeur à la page, pour son sommaire. */
  surEditeur: (editeur: Editor | null) => void;
}

function EditorSurface({ corps, id, surOuvrirPage, chemin, surEtat, surSousPage, descentes, entrer, surEntree, surSurcharges, lectureSeule, surFrappe, surEditeur }: EditorSurfaceProps) {
  const [erreurDImage, definirErreurDImage] = useState<string | null>(null);
  // Position où ouvrir la grille de taille d'un tableau (`/tableau`), null quand elle est fermée.
  const [grille, definirGrille] = useState<number | null>(null);
  const [visionneuse, definirVisionneuse] = useState<{ attributs: ImageAttributes; adresse: string } | null>(null);
  // Lien d'image collé, en attente de la réponse : télécharger ou garder le lien.
  const [lienColle, definirLienColle] = useState<{ adresse: string; position: number } | null>(null);
  const depart = useMemo(() => lireMarkdown(corps), [corps]);
  // Texte d'origine de chaque bloc : c'est ce qui permet de ne réécrire que les blocs modifiés.
  const source = useRef(depart.source);
  const cheminActuel = useRef(chemin);
  const editeurActuel = useRef<Editor | null>(null);
  const ouvrirPage = useRef(surOuvrirPage);
  useEffect(() => {
    cheminActuel.current = chemin;
    ouvrirPage.current = surOuvrirPage;
  }, [chemin, surOuvrirPage]);
  const liens = useMemo<LinkOptions>(
    () => ({
      ouvrirPage: (cible, nouvelOnglet) => ouvrirPage.current(cible, nouvelOnglet),
      titreDePage: (cible) => annuaireDesPages.lire(cible)?.titre ?? null,
      // Le lien collé reste un lien si le site ne répond pas, ou si on l'a déjà modifié entre-temps.
      surAdresseCollee: (adresse) => {
        const editeur = editeurActuel.current;
        if (editeur !== null) {
          void mentionnerLeSite(editeur, adresse, (lien) => lien.titre === null && lien.texte === libelleDAdresse(adresse));
        }
      },
    }),
    [],
  );

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
        // Une version gardée à côté se signale par le bandeau des conflits, relu au changement du dossier.
        surEnregistre: (ecrit) => {
          source.current = lireMarkdown(ecrit).source;
        },
      }),
    [corps, surEtat],
  );

  const extensions = useMemo(
    () =>
      extensionsDeLEditeur({
        chemin: () => cheminActuel.current,
        agrandir: (attributs, adresse) => definirVisionneuse({ attributs, adresse }),
        surErreurDImage: definirErreurDImage,
        surLienDImage: (adresse, position) => definirLienColle({ adresse, position }),
        liens,
      }),
    [liens],
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
    onUpdate: () => {
      sauvegarde.signalerModification();
      surFrappe();
    },
  });

  // ProseMirror n'écoute plus le clavier d'un éditeur non modifiable : raccourcis des blocs compris.
  // Sans le second argument, TipTap émettrait une mise à jour et la page se croirait modifiée.
  // La dernière frappe part sur le disque avant le passage en lecture seule : la sync la gardera si l'autre appareil a écrit aussi.
  useEffect(() => {
    if (editeur.isEditable === lectureSeule) {
      if (lectureSeule) {
        void sauvegarde.vider();
      }
      editeur.setEditable(!lectureSeule, false);
    }
  }, [editeur, lectureSeule, sauvegarde]);
  useEffect(() => {
    editeurActuel.current = editeur;
    surEditeur(editeur);
    return () => surEditeur(null);
  }, [editeur, surEditeur]);

  // Une page mentionnée ici est renommée : ses mentions prennent le nouveau titre dans l'éditeur, puis dans le
  // fichier à l'enregistrement suivant. Le main ne touche pas au fichier de la page ouverte.
  useEffect(
    () =>
      inscrireEditeurOuvert(id, (renommee, titre) => {
        if (editeur.isDestroyed) {
          return;
        }
        const positions = mentionsARenommer(editeur.state.doc, renommee, titre);
        if (positions.length > 0) {
          const transaction = editeur.state.tr;
          for (const position of positions) {
            transaction.setNodeAttribute(position, 'libelle', titre);
          }
          editeur.view.dispatch(transaction.setMeta('addToHistory', false));
        }
      }),
    [editeur, id],
  );

  useEffect(() => {
    if (descentes > 0) {
      editeur.commands.focus('start');
    }
  }, [descentes, editeur]);

  // Après l'arborescence, qui reprend le focus à la fin du renommage : les effets d'un même rendu vont dans l'ordre de l'arbre.
  // Une recherche ouverte entre-temps (Ctrl+K juste après avoir choisi la page) garde le focus. Sans délai :
  // la commande `focus` de TipTap attend l'image suivante, et prendrait le focus à une recherche ouverte d'ici là.
  useEffect(() => {
    if (entrer) {
      if (document.querySelector('[aria-modal="true"]') === null && !editeur.isDestroyed) {
        editeur.view.dispatch(editeur.state.tr.setSelection(Selection.atStart(editeur.state.doc)));
        editeur.view.focus();
      }
      surEntree();
    }
  }, [entrer, editeur, surEntree]);

  // Changement de page ou fermeture de la fenêtre : ce qui n'est pas enregistré l'est tout de suite.
  useEffect(() => {
    sauvegarde.demarrer();
    const retirer = inscrireVidage(() => sauvegarde.vider());
    return () => {
      retirer();
      // Une fois la dernière frappe écrite, le verrou de la page est rendu dès qu'elle est sur le NAS.
      const page = cheminActuel.current;
      void sauvegarde.vider().finally(() => void api.quitterPage({ chemin: page }));
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

  // Clic dans le vide sous le dernier bloc : le curseur va à la fin, dans un paragraphe vide créé s'il le faut.
  useEffect(() => {
    const surClic = (evenement: MouseEvent): void => {
      const cible = evenement.target;
      if (evenement.button !== 0 || lectureSeule || !(cible instanceof Element) || cible.closest('[data-zone-page]') === null) {
        return;
      }
      // Seulement le fond : ni le contenu, ni un bouton, un champ ou un message.
      if (editeur.view.dom.contains(cible) || cible.closest('button, a, input, textarea, nav, [role="alert"], [contenteditable]') !== null) {
        return;
      }
      if (evenement.clientY <= editeur.view.dom.getBoundingClientRect().bottom) {
        return;
      }
      evenement.preventDefault();
      editeur.view.dispatch(allerALaFin(editeur.state));
      editeur.view.focus();
    };
    document.addEventListener('mousedown', surClic);
    return () => document.removeEventListener('mousedown', surClic);
  }, [editeur, lectureSeule]);

  const actions = useMemo<SlashActions>(
    () => ({
      surSousPage,
      surTableau: () => definirGrille(editeur.state.selection.from),
      surImage: () => {
        const position = editeur.state.selection.from;
        void api.choisirImages().then(async (resultat) => {
          if (!resultat.ok) {
            definirErreurDImage(`L'image n'a pas été ajoutée : ${resultat.erreur.message}`);
            return;
          }
          const { adresses, erreurs } = await ajouterEnWebp(cheminActuel.current, resultat.fichiers);
          if (erreurs.length > 0) {
            definirErreurDImage(erreurs.join(' '));
          }
          insererImages(editeur, adresses, position);
        });
      },
    }),
    [editeur, surSousPage],
  );

  return (
    <>
      {erreurDImage !== null && (
        <div role="alert" className="bg-erreur/10 mb-4 flex items-start gap-3 rounded-md p-3 text-sm">
          <p className="flex-1">{erreurDImage}</p>
          <button
            type="button"
            onClick={() => definirErreurDImage(null)}
            aria-label="Fermer le message"
            className="text-discret hover:bg-texte/10 hover:text-texte shrink-0 rounded p-0.5"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      )}
      <EditorContent editor={editeur} />
      {!lectureSeule && (
        <>
          <BlockHandle editor={editeur} />
          <FloatingToolbar editor={editeur} />
          <ImageToolbar
            editor={editeur}
            surAgrandir={(attributs) => {
              const adresse = adresseDImage(cheminActuel.current, attributs.src);
              if (adresse !== null) {
                definirVisionneuse({ attributs, adresse });
              }
            }}
          />
          <ImageResizeHandles editor={editeur} />
          <TableHandles editor={editeur} />
          <RowColumnGrips editor={editeur} />
          <SlashMenu editor={editeur} actions={actions} />
          <MentionMenu editor={editeur} />
          <LinkTooltip editor={editeur} options={liens} />
          {grille !== null && <TableGridPicker editor={editeur} position={grille} surFermeture={() => definirGrille(null)} />}
        </>
      )}
      {lienColle !== null && <PastedImageLink editeur={editeur} lien={lienColle} chemin={() => cheminActuel.current} surFin={() => definirLienColle(null)} surErreur={definirErreurDImage} />}
      {visionneuse !== null && (
        <ImageViewer
          attributs={visionneuse.attributs}
          adresse={visionneuse.adresse}
          surFermeture={() => {
            definirVisionneuse(null);
            editeur.commands.focus();
          }}
        />
      )}
    </>
  );
}

interface LockNoticeProps {
  /** Nom de l'appareil qui tient le verrou. */
  nom: string;
  surForcage: () => Promise<void>;
}

/** La page est éditée sur un autre appareil : elle reste lisible, et se met à jour à chaque synchronisation. */
function LockNotice({ nom, surForcage }: LockNoticeProps) {
  const [enCours, definirEnCours] = useState(false);
  return (
    <div role="status" className="bg-alerte/15 mb-4 flex items-start gap-3 rounded-md p-3 text-sm">
      <Lock className="text-alerte mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p className="flex-1">
        Cette page est en cours de modification sur {nom === '' ? 'un autre appareil' : `« ${nom} »`}. Elle est en lecture seule ici et se met à jour à chaque synchronisation.
      </p>
      <button
        type="button"
        disabled={enCours}
        onClick={() => {
          definirEnCours(true);
          void surForcage().finally(() => definirEnCours(false));
        }}
        title="L'autre appareil passera en lecture seule. S'il avait des modifications pas encore synchronisées, elles seront gardées à côté de la page."
        className="bg-texte/10 hover:bg-texte/20 focus-visible:bg-accent/40 shrink-0 rounded px-2 py-1 outline-0 disabled:opacity-50"
      >
        Forcer l'édition
      </button>
    </div>
  );
}

interface PastedImageLinkProps {
  editeur: Editor;
  lien: { adresse: string; position: number };
  chemin: () => string;
  surFin: () => void;
  surErreur: (message: string) => void;
}

/** La question sur un lien d'image collé, placée au curseur, et ce que fait chaque réponse. */
function PastedImageLink({ editeur, lien, chemin, surFin, surErreur }: PastedImageLinkProps) {
  const position = Math.min(lien.position, editeur.state.doc.content.size);
  const coordonnees = editeur.view.coordsAtPos(position);
  const garderLeLien = (): void => {
    editeur.chain().focus().insertContentAt(Math.min(lien.position, editeur.state.doc.content.size), lien.adresse).run();
    surFin();
  };
  return (
    <ImageLinkPrompt
      adresse={lien.adresse}
      gauche={coordonnees.left}
      haut={coordonnees.bottom + 6}
      surRefus={garderLeLien}
      surTelechargement={async () => {
        const resultat = await api.telechargerImage({ adresse: lien.adresse });
        if (editeur.isDestroyed) {
          return null;
        }
        // Une image téléchargée est convertie en WebP comme toute image reçue, puis copiée dans la page.
        const ajout = resultat.ok ? await ajouterEnWebp(chemin(), resultat.fichiers) : null;
        if (ajout !== null && ajout.adresses.length > 0) {
          insererImages(editeur, ajout.adresses, Math.min(lien.position, editeur.state.doc.content.size));
          surFin();
          return null;
        }
        // Sans réseau ou sans image au bout du lien : le lien reste en texte, rien n'est bloqué.
        const message = resultat.ok ? (ajout?.erreurs[0] ?? "L'image n'a pas été ajoutée.") : `L'image n'a pas été téléchargée : ${resultat.erreur.message}`;
        surErreur(`${message} Le lien est gardé en texte.`);
        garderLeLien();
        return message;
      }}
    />
  );
}
