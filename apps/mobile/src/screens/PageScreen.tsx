import { analyserPage, cheminDeFavicon, cheminDuFichierPage, dossierParent, lireSurcharges } from '@notes/core';
import { extraireSommaire, lireMarkdown } from '@notes/document';
import { PageView, SubpagesBlock, cheminDeLImage, classeDePage, variablesDeSurcharge } from '@notes/ui';
import type { MentionedPage, MentionViewOptions, SiteMentionOptions } from '@notes/ui';
import { ArrowLeft, CloudOff, List, Smile } from 'lucide-react';
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent } from 'react';
import { ImageViewer } from '../components/ImageViewer';
import { OutlineSheet } from '../components/OutlineSheet';
import { PageIcon } from '../components/PageIcon';
import { BoutonIcone, TopBar } from '../components/TopBar';
import { PageEditor } from '../features/page-editor/PageEditor';
import { NewPageSheet } from '../features/quick-edit/NewPageSheet';

// La liste des emojis est lourde : chargée au premier choix d'icône, pas au lancement.
const EmojiSheet = lazy(() => import('../features/page-icon/EmojiSheet'));
import { TodoList } from '../features/todo-list/TodoList';
import { useNavigation } from '../state/navigation';
import { useNotes } from '../state/NotesContext';
import { trouverAvecParents } from '../state/pages';
import { annuaireDesPages, hoteDe } from '../state/pages-directory';
import { useFichiersDuCache } from '../state/useCacheUrls';
import { usePageWrites } from '../state/usePageWrites';
import { usePendingPageWrites } from '../state/usePendingPageWrites';
import { estEnAttente } from '../state/pending-pages';

type Lecture = { etat: 'lecture' } | { etat: 'pret'; corps: string; surcharges: Record<string, string> } | { etat: 'erreur' };

/**
 * Lecture d'une page (README §15), avec le même rendu que le desktop : le
 * Markdown passe par le schéma TipTap en lecture seule, jamais de HTML brut.
 * La page se relit après chaque sync qui a changé le cache.
 */
export function PageScreen({ chemin: cheminDemande }: { chemin: string }) {
  const { env, arbre, titres, theme, versionDuCache, noterPageOuverte, etat, modifiable, cheminActuel, modifierPage, montrerAvis } = useNotes();
  // Une page créée sans NAS change de chemin quand elle arrive sur le NAS : l'écran la suit.
  const chemin = cheminActuel(cheminDemande);
  const enAttente = estEnAttente(chemin);
  const navigation = useNavigation();
  const { adresse, echoue } = useFichiersDuCache();
  const trouve = useMemo(() => trouverAvecParents(arbre, chemin), [arbre, chemin]);
  const noeud = trouve?.noeud ?? null;
  const [lecture, definirLecture] = useState<Lecture>({ etat: 'lecture' });
  const [sommaireOuvert, definirSommaireOuvert] = useState(false);
  const [image, definirImage] = useState<{ adresse: string; legende: string } | null>(null);
  const [choixDIcone, definirChoixDIcone] = useState(false);
  const [nouvelleSousPage, definirNouvelleSousPage] = useState(false);
  /** L'icône choisie, montrée avant que l'arborescence relue l'ait. undefined : celle de l'arborescence. */
  const [iconeChoisie, definirIconeChoisie] = useState<string | null | undefined>(undefined);
  const contenu = useRef<HTMLDivElement>(null);

  const fichier = noeud === null || enAttente ? null : noeud.genre === 'fichier' ? noeud.chemin : cheminDuFichierPage(noeud.chemin);
  useEffect(() => {
    if (fichier === null) {
      return;
    }
    let annule = false;
    env.local.lireTexte(fichier).then(
      (texte) => {
        if (!annule) {
          const { enTete, corps } = analyserPage(texte);
          definirLecture({ etat: 'pret', corps, surcharges: lireSurcharges(enTete) });
        }
      },
      () => !annule && definirLecture({ etat: 'erreur' }),
    );
    return () => {
      annule = true;
    };
  }, [env, fichier, versionDuCache]);

  useEffect(() => {
    if (noeud?.id != null) {
      noterPageOuverte(noeud.id);
    }
  }, [noeud?.id, noterPageOuverte]);

  // Les images d'une note externe sont relatives à son dossier, celles d'une page au dossier de la page.
  const dossierDesImages = noeud === null ? '' : noeud.genre === 'fichier' ? dossierParent(noeud.chemin) : noeud.chemin;
  const resoudreImage = useCallback(
    (src: string) => {
      const cible = cheminDeLImage(dossierDesImages, src);
      return cible === null ? null : adresse(cible);
    },
    [adresse, dossierDesImages],
  );
  // Les images ne descendent qu'à l'affichage (README §15) : on dit qu'il y en a une même quand elle n'est pas encore là.
  const nasJoignable = etat.genre === 'a-jour' || etat.genre === 'synchro';
  const absenceImage = useCallback(
    (src: string) => {
      const cible = cheminDeLImage(dossierDesImages, src);
      if (cible === null) {
        return null;
      }
      if (!echoue(cible)) {
        return 'Téléchargement de l’image…';
      }
      return nasJoignable ? `Image introuvable : ${src}` : 'Image pas encore copiée sur le téléphone. Elle s’affichera quand le NAS répondra.';
    },
    [dossierDesImages, echoue, nasJoignable],
  );

  const mentions = useMemo<MentionViewOptions>(() => {
    const Icone = ({ page }: { page: MentionedPage }) => <PageIcon icone={page.icone} chemin={page.chemin} adresse={adresse} />;
    return { pages: annuaireDesPages(titres), Icone, ouvrir: (id) => navigation.ouvrirPageParId(id) };
  }, [titres, adresse, navigation]);
  const sites = useMemo<SiteMentionOptions>(
    () => ({
      favicon: (href) => {
        const hote = hoteDe(href);
        const cible = hote === null ? null : cheminDeFavicon(hote);
        return cible === null ? null : adresse(cible);
      },
    }),
    [adresse],
  );

  // Seules les pages du dossier des notes se modifient ; une note venue d'un autre outil reste en lecture.
  const pageModifiable = noeud !== null && noeud.genre === 'page';
  const modeListe = noeud?.mode === 'todo';
  /** Le corps affiché : celui du cache, avec les modifications qui partent sur le NAS (README §5). */
  const surLeNas = usePageWrites(pageModifiable && !enAttente ? noeud.chemin : null, lecture.etat === 'pret' ? lecture.corps : null, modeListe);
  /** Une page créée sans NAS : son contenu attend sur le téléphone, et s'écrit même sans NAS. */
  const surLeTelephone = usePendingPageWrites(pageModifiable && enAttente ? noeud.chemin : null, modeListe);
  const { corps, appliquer, remplacer } = enAttente ? surLeTelephone : surLeNas;
  const ecrivable = enAttente || modifiable;
  const sommaire = useMemo(() => (corps !== null ? extraireSommaire(lireMarkdown(corps).document) : []), [corps]);
  const couleurs = useMemo(() => (lecture.etat === 'pret' ? variablesDeSurcharge(lecture.surcharges, theme).variables : {}), [lecture, theme]);

  // L'icône affichée : celle qu'on vient de choisir tant que l'arborescence ne l'a pas.
  const icone = iconeChoisie !== undefined ? iconeChoisie : (noeud?.icone ?? null);
  useEffect(() => definirIconeChoisie(undefined), [noeud?.icone]);
  const ouvrirChoixDIcone = (): void => {
    if (!modifiable) {
      montrerAvis('Le NAS ne répond pas : la page est en lecture seule.');
      return;
    }
    definirChoixDIcone(true);
  };
  /** L'icône part dans l'en-tête de la page, sur le NAS (README §4, clé `icon`). */
  const choisirIcone = (emoji: string | null): void => {
    definirChoixDIcone(false);
    if (noeud === null) {
      return;
    }
    definirIconeChoisie(emoji);
    void modifierPage(noeud.chemin, { corpsAttendu: null, operation: () => null, meta: { icone: emoji } }).then((fait) => {
      if (!fait) {
        definirIconeChoisie(undefined);
      }
    });
  };

  /**
   * Toucher une image l'ouvre en grand. Un lien du texte mène à une page du
   * vault ou au navigateur du téléphone : la WebView ne quitte jamais l'application.
   */
  const surClic = (evenement: MouseEvent): void => {
    const cible = evenement.target as HTMLElement;
    if (cible instanceof HTMLImageElement && cible.closest('figure[data-image]') !== null && cible.src !== '') {
      const legende = cible.closest('figure')?.querySelector('figcaption')?.textContent ?? '';
      definirImage({ adresse: cible.src, legende: legende !== '' ? legende : cible.alt });
      return;
    }
    const lien = cible.closest('a[href]');
    if (lien === null) {
      return;
    }
    evenement.preventDefault();
    const href = lien.getAttribute('href') ?? '';
    if (href.startsWith('notes://')) {
      navigation.ouvrirPageParId(href.slice('notes://'.length));
    } else {
      void env.ouvrirLien(href);
    }
  };

  const allerAuTitre = (rang: number): void => {
    definirSommaireOuvert(false);
    contenu.current?.querySelectorAll(`.${classeDePage} :is(h1, h2, h3, h4, h5)`)[rang]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="min-h-dvh">
      <TopBar
        gauche={
          <BoutonIcone libelle="Retour" onClick={navigation.retour}>
            <ArrowLeft className="size-5" />
          </BoutonIcone>
        }
        titre={noeud?.titre}
        droite={
          sommaire.length > 0 && (
            <BoutonIcone libelle="Sommaire" onClick={() => definirSommaireOuvert(true)}>
              <List className="size-5" />
            </BoutonIcone>
          )
        }
      />
      <main className="marge-bas px-5 pb-16" ref={contenu} style={couleurs as CSSProperties}>
        {noeud === null ? (
          <p className="py-10 text-center text-discret">Cette page n’est plus sur le NAS.</p>
        ) : (
          <>
            {trouve !== null && trouve.parents.length > 0 && (
              <nav className="flex flex-wrap items-center gap-x-1 pt-1 text-sm text-discret" aria-label="Emplacement">
                {trouve.parents.map((parent) => (
                  <span key={parent.chemin} className="flex items-center gap-1">
                    {parent.genre === 'dossier' ? (
                      <span>{parent.titre}</span>
                    ) : (
                      <button type="button" className="rounded outline-none active:bg-texte/10" onClick={() => navigation.ouvrir({ nom: 'page', chemin: parent.chemin })}>
                        {parent.titre}
                      </button>
                    )}
                    <span aria-hidden="true">›</span>
                  </span>
                ))}
              </nav>
            )}
            {pageModifiable && !modifiable && !enAttente && (
              <p className="mt-3 flex items-center gap-2 rounded-lg bg-alerte/15 px-3 py-2 text-sm text-alerte">
                <CloudOff className="size-4 shrink-0" />
                Le NAS ne répond pas : lecture seule.
              </p>
            )}
            <div className="pt-4 pb-2">
              {pageModifiable && !enAttente ? (
                icone !== null ? (
                  <button type="button" aria-label="Changer l’icône de la page" onClick={ouvrirChoixDIcone} className="mb-2 rounded-lg outline-none active:bg-texte/10">
                    <PageIcon icone={icone} chemin={noeud.chemin} adresse={adresse} className="text-5xl" />
                  </button>
                ) : (
                  <button type="button" onClick={ouvrirChoixDIcone} className="mb-1 flex items-center gap-1.5 rounded-lg py-1 pr-2 text-sm text-discret outline-none active:bg-texte/10">
                    <Smile className="size-4" />
                    Ajouter une icône
                  </button>
                )
              ) : (
                noeud.icone !== null && <PageIcon icone={noeud.icone} chemin={noeud.chemin} adresse={adresse} className="mb-2 text-5xl" />
              )}
              <h1 className="text-[1.9rem] leading-tight font-bold break-words">{noeud.titre}</h1>
            </div>
            {!enAttente && noeud.genre === 'page' && (
              <SubpagesBlock
                pages={noeud.enfants.filter((enfant) => enfant.genre !== 'dossier').map((enfant) => ({ cle: enfant.chemin, titre: enfant.titre }))}
                icone={(page) => {
                  const enfant = noeud.enfants.find((autre) => autre.chemin === page.cle);
                  return enfant === undefined ? null : <PageIcon icone={enfant.icone} chemin={enfant.chemin} liste={enfant.mode === 'todo'} adresse={adresse} />;
                }}
                ouvrir={(page) => navigation.ouvrir({ nom: 'page', chemin: page.cle })}
                creer={() => definirNouvelleSousPage(true)}
              />
            )}
            {enAttente && (
              <p className="mb-3 flex items-center gap-2 rounded-lg bg-texte/5 px-3 py-2 text-sm text-discret">
                <CloudOff className="size-4 shrink-0" />
                {modifiable ? 'Création sur le NAS…' : 'Pas encore sur le NAS : la page et ce que tu y écris partiront dès qu’il répondra.'}
              </p>
            )}
            {lecture.etat === 'erreur' && <p className="py-6 text-discret">Cette page n’est pas encore sur le téléphone : elle arrivera à la prochaine synchronisation.</p>}
            {corps !== null && pageModifiable && modeListe && (
              <div onClickCapture={surClic}>
                <TodoList
                  page={noeud.chemin}
                  corps={corps}
                  modifiable={ecrivable}
                  appliquer={appliquer}
                  rendreBlocs={(markdown) => <PageView corps={markdown} resoudreImage={resoudreImage} absenceImage={absenceImage} mentions={mentions} sites={sites} />}
                />
              </div>
            )}
            {corps !== null && pageModifiable && !modeListe && (
              <div onClickCapture={surClic}>
                <PageEditor
                  page={noeud.chemin}
                  corps={corps}
                  modifiable={ecrivable}
                  remplacer={remplacer}
                  resoudreImage={resoudreImage}
                  absenceImage={absenceImage}
                  mentions={mentions}
                  sites={sites}
                />
              </div>
            )}
            {corps !== null && !pageModifiable && (
              <div onClickCapture={surClic}>
                {corps.trim() === '' ? (
                  <p className="text-discret">Page vide.</p>
                ) : (
                  <PageView corps={corps} resoudreImage={resoudreImage} absenceImage={absenceImage} mentions={mentions} sites={sites} />
                )}
              </div>
            )}
          </>
        )}
      </main>
      {sommaireOuvert && <OutlineSheet entrees={sommaire} choisir={allerAuTitre} fermer={() => definirSommaireOuvert(false)} />}
      {choixDIcone && noeud !== null && (
        <Suspense fallback={null}>
          <EmojiSheet actuelle={icone} choisir={choisirIcone} fermer={() => definirChoixDIcone(false)} />
        </Suspense>
      )}
      {nouvelleSousPage && noeud !== null && (
        <NewPageSheet
          parent={noeud.chemin}
          titreDuParent={noeud.titre}
          fermer={() => definirNouvelleSousPage(false)}
          creee={(cheminCree) => {
            definirNouvelleSousPage(false);
            navigation.ouvrir({ nom: 'page', chemin: cheminCree });
          }}
        />
      )}
      {image !== null && <ImageViewer adresse={image.adresse} legende={image.legende} fermer={() => definirImage(null)} />}
    </div>
  );
}
