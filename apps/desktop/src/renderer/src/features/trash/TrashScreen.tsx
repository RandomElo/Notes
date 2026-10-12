import type { TreeNode } from '@notes/core';
import { PageView } from '@notes/ui';
import { FileText, Image as IconeImage, Mic, RotateCcw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { TrashListResult, TrashPlace, TrashPreviewResult } from '../../../../shared/ipc-contract';
import { api } from '../../lib/ipc';
import { versDataUri } from '../export/export-images';
import { MemoPlayer } from '../voice-memos/MemoPlayer';
import { dateDeSuppression, delaiAvantEffacement, emplacementDOrigine, typeDImage } from './trash-labels';

type Entry = TrashListResult['entrees'][number];

interface TrashScreenProps {
  /** Une entrée vient d'être restaurée : l'arbre à jour. */
  surRestauration: (arbre: TreeNode[]) => void;
  /** Ouvre une page restaurée, par son identifiant. */
  surOuverture: (id: string) => void;
}

const cleDe = (entree: Pick<Entry, 'entree' | 'emplacement'>): string => `${entree.emplacement}:${entree.entree}`;

const bouton = 'inline-flex h-8 items-center justify-center gap-2 rounded-md px-3 text-sm leading-none font-medium whitespace-nowrap outline-0';
const boutonDiscret = `${bouton} hover:bg-texte/10 focus-visible:bg-texte/20`;
const boutonAccent = `${bouton} bg-accent/20 hover:bg-accent/35 focus-visible:bg-accent/45`;
const boutonDanger = `${bouton} bg-erreur/20 hover:bg-erreur/35 focus-visible:bg-erreur/45`;

/**
 * Corbeille (docs/spec/corbeille.md), à la place de la page : liste des entrées du poste
 * et du NAS, aperçu en lecture seule de celle qu'on choisit, restaurer,
 * supprimer définitivement ou tout vider (avec confirmation, à côté du bouton).
 */
export function TrashScreen({ surRestauration, surOuverture }: TrashScreenProps) {
  const [liste, definirListe] = useState<TrashListResult | null>(null);
  const [choisie, definirChoisie] = useState<string | null>(null);
  const [confirmationDuVidage, definirConfirmationDuVidage] = useState(false);
  const [messageDuVidage, definirMessageDuVidage] = useState<string | null>(null);
  // Dernière restauration : affichée en tête de l'aperçu, avec « Ouvrir » pour une page.
  const [restauree, definirRestauree] = useState<{ titre: string; id: string | null; ou: string } | null>(null);
  const boutons = useRef(new Map<string, HTMLButtonElement>());

  const recharger = useCallback(async () => {
    const recue = await api.listerCorbeille();
    definirListe(recue);
    definirChoisie((actuelle) => (actuelle !== null && recue.entrees.some((entree) => cleDe(entree) === actuelle) ? actuelle : (recue.entrees[0] === undefined ? null : cleDe(recue.entrees[0]))));
  }, []);

  useEffect(() => {
    void recharger();
  }, [recharger]);

  const entrees = liste?.entrees ?? [];
  const entree = entrees.find((candidate) => cleDe(candidate) === choisie) ?? null;
  const maintenant = Date.now();

  const surToucheDeLaListe = (evenement: KeyboardEvent, rang: number) => {
    const pas = evenement.key === 'ArrowDown' ? 1 : evenement.key === 'ArrowUp' ? -1 : 0;
    const suivante = entrees[rang + pas];
    if (pas !== 0 && suivante !== undefined) {
      evenement.preventDefault();
      definirChoisie(cleDe(suivante));
      boutons.current.get(cleDe(suivante))?.focus();
    }
  };

  return (
    <div className="@container mx-auto max-w-5xl space-y-6 py-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Corbeille</h2>
          <p className="text-discret mt-1 text-sm">Les pages et images supprimées restent ici 30 jours, puis sont effacées pour de bon.</p>
          {liste?.nas === 'injoignable' && (
            <p className="text-alerte mt-1 text-sm">Le NAS ne répond pas : seules les pages encore sur ce poste sont listées.</p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2" aria-live="polite">
          {messageDuVidage !== null && <p className="text-erreur text-sm">{messageDuVidage}</p>}
          <Confirmable
            actif={confirmationDuVidage}
            surActivation={definirConfirmationDuVidage}
            libelle="Vider la corbeille"
            confirmation="Tout effacer pour de bon"
            desactive={entrees.length === 0}
            surConfirmation={async () => {
              const resultat = await api.viderCorbeille();
              definirMessageDuVidage(resultat.ok ? null : resultat.erreur.message);
              definirRestauree(null);
              await recharger();
            }}
          />
        </div>
      </header>

      {liste === null ? (
        <p className="text-discret text-sm">Lecture de la corbeille…</p>
      ) : entrees.length === 0 ? (
        <p className="text-discret text-sm">{restauree === null ? 'La corbeille est vide.' : ''}</p>
      ) : null}
      {restauree !== null && (
        <div role="status" className="bg-surface flex flex-wrap items-center justify-between gap-3 rounded-lg p-3 text-sm">
          <p>
            « {restauree.titre} » est revenue {restauree.ou}.
          </p>
          {restauree.id !== null && (
            <button type="button" onClick={() => restauree.id !== null && surOuverture(restauree.id)} className={boutonAccent}>
              Ouvrir
            </button>
          )}
        </div>
      )}

      {entrees.length > 0 && (
        <div className="grid gap-6 @2xl:grid-cols-[16rem_minmax(0,1fr)]">
          <ul aria-label="Éléments de la corbeille" className="space-y-0.5">
            {entrees.map((element, rang) => {
              const cle = cleDe(element);
              const Icone = element.nature === 'image' ? IconeImage : element.nature === 'memo' ? Mic : FileText;
              const active = cle === choisie;
              return (
                <li key={cle}>
                  <button
                    ref={(bouton) => {
                      if (bouton === null) {
                        boutons.current.delete(cle);
                      } else {
                        boutons.current.set(cle, bouton);
                      }
                    }}
                    type="button"
                    aria-current={active}
                    tabIndex={active || (choisie === null && rang === 0) ? 0 : -1}
                    onClick={() => definirChoisie(cle)}
                    onKeyDown={(evenement) => surToucheDeLaListe(evenement, rang)}
                    className={`flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-0 ${
                      active ? 'bg-accent/25 focus-visible:bg-accent/40' : 'hover:bg-texte/10 focus-visible:bg-texte/20'
                    }`}
                  >
                    <Icone className="text-discret mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{element.titre}</span>
                      <span className="text-discret block truncate text-xs">
                        {dateDeSuppression(element.supprimeLe, maintenant)}
                        {element.emplacement === 'poste' && liste?.nas !== 'non_regle' ? ', pas encore sur le NAS' : ''}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {entree !== null && (
            <EntryPreview
              key={cleDe(entree)}
              entree={entree}
              maintenant={maintenant}
              surRestauree={(page, arbre) => {
                surRestauration(arbre);
                definirRestauree({ titre: entree.titre, id: page.id, ou: emplacementDOrigine(page.chemin) });
                void recharger();
              }}
              surSupprimee={() => {
                definirRestauree(null);
                void recharger();
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

interface EntryPreviewProps {
  entree: Entry;
  maintenant: number;
  surRestauree: (page: { chemin: string; id: string | null }, arbre: TreeNode[]) => void;
  surSupprimee: () => void;
}

/** L'entrée choisie : d'où elle vient, ses actions, puis son contenu en lecture seule. */
function EntryPreview({ entree, maintenant, surRestauree, surSupprimee }: EntryPreviewProps) {
  const [apercu, definirApercu] = useState<TrashPreviewResult | null>(null);
  const [confirmation, definirConfirmation] = useState(false);
  const [erreur, definirErreur] = useState<string | null>(null);
  const [enCours, definirEnCours] = useState(false);
  const cible = { entree: entree.entree, emplacement: entree.emplacement as TrashPlace };

  useEffect(() => {
    let actif = true;
    void api.apercuCorbeille({ entree: entree.entree, emplacement: entree.emplacement }).then((recu) => {
      if (actif) {
        definirApercu(recu);
      }
    });
    return () => {
      actif = false;
    };
  }, [entree.entree, entree.emplacement]);

  return (
    <section aria-label={`Aperçu de ${entree.titre}`} className="min-w-0 space-y-4">
      <div className="bg-surface space-y-3 rounded-lg p-4 text-sm">
        <div>
          <h3 className="text-lg font-semibold break-words">{entree.titre}</h3>
          <p className="text-discret mt-0.5">
            {entree.nature === 'image' ? 'Image' : entree.nature === 'memo' ? 'Mémo vocal' : 'Page'} supprimée {dateDeSuppression(entree.supprimeLe, maintenant)}, {emplacementDOrigine(entree.cheminOrigine)}.{' '}
            {delaiAvantEffacement(entree.supprimeLe, maintenant)}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2" aria-live="polite">
          <button
            type="button"
            aria-disabled={enCours}
            onClick={async () => {
              if (enCours) {
                return;
              }
              definirEnCours(true);
              const resultat = await api.restaurerDeLaCorbeille(cible);
              definirEnCours(false);
              if (resultat.ok) {
                surRestauree(resultat.page, resultat.arbre);
              } else {
                definirErreur(resultat.erreur.message);
              }
            }}
            className={boutonAccent}
          >
            <RotateCcw className="size-4 shrink-0" aria-hidden="true" />
            Restaurer
          </button>
          <Confirmable
            actif={confirmation}
            surActivation={definirConfirmation}
            libelle="Supprimer définitivement"
            confirmation="Effacer pour de bon"
            surConfirmation={async () => {
              const resultat = await api.supprimerDeLaCorbeille(cible);
              if (resultat.ok) {
                surSupprimee();
              } else {
                definirErreur(resultat.erreur.message);
              }
            }}
          />
          {erreur !== null && <p className="text-erreur w-full">{erreur}</p>}
        </div>
      </div>

      {apercu === null ? (
        <p className="text-discret text-sm">Lecture…</p>
      ) : !apercu.ok ? (
        <p className="text-erreur text-sm">{apercu.erreur.message}</p>
      ) : apercu.nature === 'memo' ? (
        <MemoPlayer octets={apercu.octets} nom={entree.nom} libelle={`Écouter ${entree.titre}`} />
      ) : apercu.nature === 'image' ? (
        <img src={versDataUri(apercu.octets, typeDImage(entree.nom))} alt={entree.titre} className="max-h-96 max-w-full rounded-md" />
      ) : (
        <div className="space-y-4">
          {apercu.sousPages.length > 0 && (
            <div className="text-sm">
              <p className="text-discret">{apercu.sousPages.length === 1 ? 'Une sous-page, restaurée avec elle :' : `${apercu.sousPages.length} sous-pages, restaurées avec elle :`}</p>
              <ul className="mt-1">
                {apercu.sousPages.map((titre, rang) => (
                  <li key={rang} className="whitespace-pre">
                    {titre}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {apercu.corps.trim() === '' ? <p className="text-discret text-sm">Page sans contenu.</p> : <PageView corps={apercu.corps} />}
        </div>
      )}
    </section>
  );
}

interface ConfirmableProps {
  actif: boolean;
  surActivation: (actif: boolean) => void;
  libelle: string;
  confirmation: string;
  desactive?: boolean;
  surConfirmation: () => Promise<void>;
}

/**
 * Bouton d'une action sans retour : un premier clic le remplace, au même
 * endroit, par la confirmation et « Annuler ». `Échap` annule.
 */
function Confirmable({ actif, surActivation, libelle, confirmation, desactive = false, surConfirmation }: ConfirmableProps) {
  const confirmer = useRef<HTMLButtonElement>(null);
  const [enCours, definirEnCours] = useState(false);

  useEffect(() => {
    if (actif) {
      confirmer.current?.focus();
    }
  }, [actif]);

  if (!actif) {
    return (
      <button
        type="button"
        aria-disabled={desactive}
        onClick={() => !desactive && surActivation(true)}
        className={`${boutonDiscret} ${desactive ? 'opacity-50' : ''}`}
      >
        <Trash2 className="size-4 shrink-0" aria-hidden="true" />
        {libelle}
      </button>
    );
  }
  return (
    <span
      className="inline-flex flex-wrap items-center gap-2"
      onKeyDown={(evenement) => {
        if (evenement.key === 'Escape') {
          // L'écran de la corbeille ne doit pas se fermer pour autant.
          evenement.preventDefault();
          surActivation(false);
        }
      }}
    >
      <button
        ref={confirmer}
        type="button"
        aria-disabled={enCours}
        onClick={async () => {
          if (enCours) {
            return;
          }
          definirEnCours(true);
          await surConfirmation();
          definirEnCours(false);
          surActivation(false);
        }}
        className={boutonDanger}
      >
        <Trash2 className="size-4 shrink-0" aria-hidden="true" />
        {confirmation}
      </button>
      <button type="button" onClick={() => surActivation(false)} className={boutonDiscret}>
        Annuler
      </button>
    </span>
  );
}
