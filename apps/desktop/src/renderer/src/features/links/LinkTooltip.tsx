import { estAdresseWeb } from '@notes/document';
import { titreDeMentionDeSite } from '@notes/ui';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import type { Editor } from '@tiptap/react';
import { AtSign, Check, Copy, ExternalLink, Link2, Pencil, Unlink } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { annuaireDesPages } from '../mentions/pages-directory';
import { lienA, lienDuCurseur, normaliserAdresse, poserLien, retirerLien } from './link-commands';
import type { LinkRange } from './link-commands';
import { ouvrirAdresse } from './link-extension';
import { afficherEnLien, mentionnerLeSite } from './site-mention';
import type { LinkOptions, LinkStorage } from './link-extension';

type Cible = { genre: 'lien'; lien: LinkRange } | { genre: 'mention'; position: number; id: string; libelle: string };

interface Formulaire {
  de: number;
  a: number;
  texte: string;
  adresse: string;
  /** Titre Markdown du lien : une mention de site le reste tant que son adresse ne change pas. */
  titre: string | null;
  /** Champ qui prend le focus à l'ouverture. */
  champ: 'texte' | 'adresse';
}

/** Délais du survol : l'infobulle ne vient pas sur un simple passage de la souris, et ne part pas pendant qu'on va vers elle. */
const delaiDApparitionMs = 350;
const delaiDeDepartMs = 400;

function cibleDuCurseur(editor: Editor): Cible | null {
  const { selection } = editor.state;
  if (selection instanceof NodeSelection && selection.node.type.name === 'pageMention') {
    return { genre: 'mention', position: selection.from, id: String(selection.node.attrs['id']), libelle: String(selection.node.attrs['libelle']) };
  }
  const lien = lienDuCurseur(editor.state);
  return lien === null ? null : { genre: 'lien', lien };
}

function cibleDeLElement(editor: Editor, element: Element): Cible | null {
  const vue = editor.view;
  if (element.classList.contains('mention')) {
    const position = vue.posAtDOM(element, 0);
    for (const candidate of [position, position - 1]) {
      const noeud = candidate >= 0 ? editor.state.doc.nodeAt(candidate) : null;
      if (noeud?.type.name === 'pageMention') {
        return { genre: 'mention', position: candidate, id: String(noeud.attrs['id']), libelle: String(noeud.attrs['libelle']) };
      }
    }
    return null;
  }
  const lien = lienA(editor.state, vue.posAtDOM(element, 0));
  return lien === null ? null : { genre: 'lien', lien };
}

/**
 * Infobulle d'un lien ou d'une mention (docs/spec/editeur.md), au survol ou quand le
 * curseur y entre au clavier : l'adresse ou la page, et de quoi la modifier,
 * la copier ou la retirer. Le bouton « Lien » de la barre d'outils ouvre son
 * formulaire sur la sélection.
 */
export function LinkTooltip({ editor, options }: { editor: Editor; options: LinkOptions }) {
  const [cible, definirCible] = useState<Cible | null>(null);
  const [formulaire, definirFormulaire] = useState<Formulaire | null>(null);
  const [copie, definirCopie] = useState(false);
  // Passage d'un lien en mention de site : le site est contacté, ce qui prend un moment.
  const [mention, definirMention] = useState<{ etat: 'repos' } | { etat: 'en-cours' } | { etat: 'echec'; message: string }>({ etat: 'repos' });
  useEffect(() => definirMention({ etat: 'repos' }), [cible]);
  const [position, definirPosition] = useState<{ gauche: number; haut: number } | null>(null);
  const bulle = useRef<HTMLDivElement>(null);
  const minuteur = useRef<number | undefined>(undefined);
  const parSurvol = useRef(false);

  // Survol d'un lien ou d'une mention, et curseur qui y entre au clavier.
  useEffect(() => {
    const zone = editor.view.dom;
    // La souris va du lien vers la bulle : on ne ferme pas une bulle qu'elle survole.
    const partir = (): void => {
      if (bulle.current?.matches(':hover') === true) {
        return;
      }
      parSurvol.current = false;
      definirCible(cibleDuCurseur(editor));
    };
    const surSurvol = (evenement: MouseEvent): void => {
      const element = evenement.target instanceof Element ? evenement.target.closest('a[href], .mention') : null;
      window.clearTimeout(minuteur.current);
      if (element === null || !zone.contains(element)) {
        if (parSurvol.current) {
          minuteur.current = window.setTimeout(partir, delaiDeDepartMs);
        }
        return;
      }
      minuteur.current = window.setTimeout(() => {
        parSurvol.current = true;
        definirCible(cibleDeLElement(editor, element));
      }, delaiDApparitionMs);
    };
    const surSortie = (): void => {
      window.clearTimeout(minuteur.current);
      if (parSurvol.current) {
        minuteur.current = window.setTimeout(partir, delaiDeDepartMs);
      }
    };
    const surSelection = (): void => {
      if (!parSurvol.current) {
        definirCible(editor.isFocused ? cibleDuCurseur(editor) : null);
      }
    };
    const surTouche = (): void => {
      parSurvol.current = false;
    };
    zone.addEventListener('mouseover', surSurvol);
    zone.addEventListener('mouseleave', surSortie);
    zone.addEventListener('keydown', surTouche);
    editor.on('selectionUpdate', surSelection);
    editor.on('blur', surSelection);
    return () => {
      window.clearTimeout(minuteur.current);
      zone.removeEventListener('mouseover', surSurvol);
      zone.removeEventListener('mouseleave', surSortie);
      zone.removeEventListener('keydown', surTouche);
      editor.off('selectionUpdate', surSelection);
      editor.off('blur', surSelection);
    };
  }, [editor]);

  // Bouton « Lien » de la barre d'outils : le formulaire sur le lien du curseur, ou sur la sélection.
  useEffect(() => {
    const stockage = (editor.storage as unknown as { liens: LinkStorage }).liens;
    stockage.ouvrirFormulaire = () => {
      const { selection } = editor.state;
      const lien = lienA(editor.state, selection.from);
      if (lien !== null && selection.from >= lien.de && selection.to <= lien.a) {
        definirFormulaire({ de: lien.de, a: lien.a, texte: lien.texte, adresse: lien.adresse, titre: lien.titre, champ: 'adresse' });
        return;
      }
      if (selection instanceof TextSelection && !selection.empty && selection.$from.sameParent(selection.$to)) {
        definirFormulaire({
          de: selection.from,
          a: selection.to,
          texte: editor.state.doc.textBetween(selection.from, selection.to),
          adresse: '',
          titre: null,
          champ: 'adresse',
        });
      }
    };
    return () => {
      stockage.ouvrirFormulaire = null;
    };
  }, [editor]);

  const ancre = formulaire?.de ?? (cible === null ? null : cible.genre === 'lien' ? cible.lien.de : cible.position);
  useLayoutEffect(() => {
    if (ancre === null || ancre > editor.state.doc.content.size) {
      definirPosition(null);
      return;
    }
    const coordonnees = editor.view.coordsAtPos(ancre);
    const largeur = bulle.current?.offsetWidth ?? 0;
    const hauteur = bulle.current?.offsetHeight ?? 0;
    // Juste sous la ligne : l'écart visible est un bord transparent de la bulle, que la souris traverse sans la quitter.
    const dessous = coordonnees.bottom;
    const haut = dessous + hauteur > window.innerHeight - 8 ? Math.max(8, coordonnees.top - hauteur) : dessous;
    definirPosition({ gauche: Math.max(8, Math.min(coordonnees.left, window.innerWidth - largeur - 8)), haut });
  }, [editor, ancre, cible, formulaire]);

  useEffect(() => {
    if (!copie) {
      return;
    }
    const attente = window.setTimeout(() => definirCopie(false), 1500);
    return () => window.clearTimeout(attente);
  }, [copie]);

  const fermer = (): void => {
    parSurvol.current = false;
    definirCible(null);
    definirFormulaire(null);
  };

  if (formulaire !== null) {
    return (
      <div
        ref={bulle}
        style={{ left: position?.gauche ?? 0, top: position?.haut ?? 0, visibility: position === null ? 'hidden' : 'visible' }}
        className="fixed z-40 py-1.5"
      >
        <LinkForm
          initial={formulaire}
          surValidation={(texte, adresse) => {
            if (adresse === null) {
              editor.view.dispatch(retirerLien(editor.state, formulaire));
            } else {
              editor.view.dispatch(poserLien(editor.state, formulaire, texte, adresse, adresse === formulaire.adresse ? formulaire.titre : null));
            }
            fermer();
            editor.commands.focus();
          }}
          surAbandon={() => {
            fermer();
            editor.commands.focus();
          }}
        />
      </div>
    );
  }
  if (cible === null) {
    return null;
  }

  // Les boutons ne prennent pas le focus : la sélection de l'éditeur reste en place.
  const sansFocus = (evenement: { preventDefault(): void }): void => evenement.preventDefault();
  const bouton = 'hover:bg-texte/10 flex h-7 items-center gap-1.5 rounded px-2 text-sm';
  const page = cible.genre === 'mention' ? annuaireDesPages.lire(cible.id) : null;

  return (
    <div
      ref={bulle}
      style={{ left: position?.gauche ?? 0, top: position?.haut ?? 0, visibility: position === null ? 'hidden' : 'visible' }}
      onMouseEnter={() => window.clearTimeout(minuteur.current)}
      onMouseLeave={() => {
        if (parSurvol.current) {
          minuteur.current = window.setTimeout(fermer, delaiDeDepartMs);
        }
      }}
      className="fixed z-40 py-1.5"
    >
      <div
        role="toolbar"
        aria-label={cible.genre === 'lien' ? 'Lien' : 'Mention'}
        className="border-bordure bg-surface flex max-w-md items-center gap-0.5 rounded-md border p-1 shadow-xl shadow-black/40"
      >
        {cible.genre === 'lien' ? (
          <>
            <button
              type="button"
              onMouseDown={sansFocus}
              onClick={(evenement) => ouvrirAdresse(cible.lien.adresse, evenement.ctrlKey, options)}
              title={`Ouvrir ${cible.lien.adresse}`}
              className={`${bouton} text-accent min-w-0`}
            >
              <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{cible.lien.adresse}</span>
            </button>
            <span className="bg-bordure mx-0.5 h-5 w-px shrink-0" aria-hidden="true" />
            <button
              type="button"
              onMouseDown={sansFocus}
              onClick={() =>
                definirFormulaire({ de: cible.lien.de, a: cible.lien.a, texte: cible.lien.texte, adresse: cible.lien.adresse, titre: cible.lien.titre, champ: 'texte' })
              }
              className={`${bouton} shrink-0`}
            >
              <Pencil className="size-3.5" aria-hidden="true" />
              Modifier
            </button>
            {cible.lien.titre === titreDeMentionDeSite ? (
              <button
                type="button"
                onMouseDown={sansFocus}
                onClick={() => {
                  afficherEnLien(editor, cible.lien);
                  fermer();
                }}
                title="Afficher comme un simple lien, sans la favicon ni le titre du site"
                className={`${bouton} shrink-0`}
              >
                <Link2 className="size-3.5" aria-hidden="true" />
                En lien
              </button>
            ) : (
              estAdresseWeb(cible.lien.adresse) && (
                <button
                  type="button"
                  disabled={mention.etat === 'en-cours'}
                  onMouseDown={sansFocus}
                  onClick={() => {
                    definirMention({ etat: 'en-cours' });
                    const debut = cible.lien.de;
                    void mentionnerLeSite(editor, cible.lien.adresse, (lien) => lien.de === debut).then((message) => {
                      if (message === null) {
                        fermer();
                      } else {
                        definirMention({ etat: 'echec', message });
                      }
                    });
                  }}
                  title={mention.etat === 'echec' ? mention.message : 'Afficher avec la favicon et le titre du site'}
                  className={`${bouton} shrink-0`}
                >
                  <AtSign className="size-3.5" aria-hidden="true" />
                  {mention.etat === 'en-cours' ? 'Mention…' : mention.etat === 'echec' ? 'Site injoignable' : 'Mention'}
                </button>
              )
            )}
            <button
              type="button"
              onMouseDown={sansFocus}
              onClick={() => void navigator.clipboard.writeText(cible.lien.adresse).then(() => definirCopie(true))}
              aria-label="Copier l'adresse"
              title="Copier l'adresse"
              className={`${bouton} shrink-0`}
            >
              {copie ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
            </button>
            <button
              type="button"
              onMouseDown={sansFocus}
              onClick={() => {
                editor.view.dispatch(retirerLien(editor.state, cible.lien));
                fermer();
              }}
              aria-label="Retirer le lien"
              title="Retirer le lien (le texte reste)"
              className={`${bouton} shrink-0`}
            >
              <Unlink className="size-3.5" aria-hidden="true" />
            </button>
          </>
        ) : (
          <>
            <span className="text-discret min-w-0 truncate px-2 text-sm">
              {page === null ? `Page introuvable : ${cible.libelle}` : page.chemin.split('/').join(' / ')}
            </span>
            <span className="bg-bordure mx-0.5 h-5 w-px shrink-0" aria-hidden="true" />
            <button
              type="button"
              onMouseDown={sansFocus}
              onClick={() => {
                // La mention laisse la place à « @ » : la liste des pages s'ouvre pour en choisir une autre.
                const noeud = editor.state.doc.nodeAt(cible.position);
                if (noeud?.type.name !== 'pageMention') {
                  return;
                }
                fermer();
                editor
                  .chain()
                  .focus()
                  .insertContentAt({ from: cible.position, to: cible.position + noeud.nodeSize }, '@')
                  .run();
              }}
              className={`${bouton} shrink-0`}
            >
              <AtSign className="size-3.5" aria-hidden="true" />
              Changer de page
            </button>
            <button
              type="button"
              onMouseDown={sansFocus}
              onClick={() => {
                const noeud = editor.state.doc.nodeAt(cible.position);
                if (noeud?.type.name !== 'pageMention') {
                  return;
                }
                const texte = page?.titre ?? cible.libelle;
                const transaction = editor.state.tr;
                if (texte === '') {
                  transaction.delete(cible.position, cible.position + noeud.nodeSize);
                } else {
                  transaction.replaceWith(cible.position, cible.position + noeud.nodeSize, editor.state.schema.text(texte, noeud.marks));
                }
                editor.view.dispatch(transaction);
                fermer();
              }}
              aria-label="Retirer la mention"
              title="Retirer la mention (son titre reste en texte)"
              className={`${bouton} shrink-0`}
            >
              <Unlink className="size-3.5" aria-hidden="true" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

interface LinkFormProps {
  initial: Formulaire;
  /** « adresse » null : retirer le lien (adresse effacée). */
  surValidation: (texte: string, adresse: string | null) => void;
  surAbandon: () => void;
}

/** Texte et adresse d'un lien. Entrée valide, Échap annule. Une adresse vide retire le lien. */
function LinkForm({ initial, surValidation, surAbandon }: LinkFormProps) {
  const [texte, definirTexte] = useState(initial.texte);
  const [adresse, definirAdresse] = useState(initial.adresse);
  const [erreur, definirErreur] = useState<string | null>(null);
  const champTexte = useRef<HTMLInputElement>(null);
  const champAdresse = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const champ = initial.champ === 'texte' ? champTexte.current : champAdresse.current;
    champ?.focus();
    champ?.select();
  }, [initial.champ]);

  const valider = (evenement: FormEvent): void => {
    evenement.preventDefault();
    if (adresse.trim() === '') {
      surValidation(texte, null);
      return;
    }
    const normalisee = normaliserAdresse(adresse);
    if (normalisee === null) {
      definirErreur('Adresse non reconnue : elle doit commencer par https://, http:// ou mailto:.');
      return;
    }
    surValidation(texte, normalisee);
  };
  const surTouche = (evenement: KeyboardEvent): void => {
    if (evenement.key === 'Escape') {
      evenement.preventDefault();
      evenement.stopPropagation();
      surAbandon();
    }
  };
  const champ = 'bg-texte/10 focus:bg-texte/15 placeholder:text-discret h-8 w-full rounded px-2 text-sm outline-0';

  return (
    <form
      role="dialog"
      aria-label="Modifier le lien"
      onSubmit={valider}
      onKeyDown={surTouche}
      className="border-bordure bg-surface w-80 space-y-2 rounded-md border p-3 shadow-xl shadow-black/40"
    >
      <label className="block space-y-1">
        <span className="text-discret text-xs">Texte</span>
        <input ref={champTexte} value={texte} onChange={(evenement) => definirTexte(evenement.target.value)} spellCheck={false} className={champ} />
      </label>
      <label className="block space-y-1">
        <span className="text-discret text-xs">Adresse</span>
        <input
          ref={champAdresse}
          value={adresse}
          onChange={(evenement) => {
            definirAdresse(evenement.target.value);
            definirErreur(null);
          }}
          placeholder="https://"
          spellCheck={false}
          className={champ}
        />
      </label>
      {erreur !== null && (
        <p role="alert" className="text-erreur text-xs">
          {erreur}
        </p>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={surAbandon} className="hover:bg-texte/10 focus-visible:bg-texte/20 rounded px-2.5 py-1 text-sm outline-0">
          Annuler
        </button>
        <button type="submit" className="bg-accent/25 hover:bg-accent/35 focus-visible:bg-accent/45 rounded px-2.5 py-1 text-sm outline-0">
          Valider
        </button>
      </div>
    </form>
  );
}
