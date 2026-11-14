import type { BaseConfig, BaseField, BaseFieldType } from '@notes/core';
import { ArrowDown, ArrowUp, List, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { typesDeChamp } from './database-model';

/** Ce qu'un changement de mode va faire, montré avant de le lancer. */
export type ConversionPreview = { versTableau: true; lignes: number; restent: string[] } | { versTableau: false; lignes: number };

interface BaseSettingsDialogProps {
  config: BaseConfig;
  surRenommerChamp: (ancien: string, nouveau: string) => Promise<boolean>;
  surType: (nom: string, type: BaseFieldType) => void;
  surRetirerChamp: (nom: string) => void;
  surDeplacerChamp: (nom: string, pas: -1 | 1) => void;
  surAjouterChamp: (nom: string, type: BaseFieldType) => void;
  /** Ouvre les valeurs possibles d'un champ « choix » près du bouton. */
  surValeursPossibles: (nom: string, x: number, y: number) => void;
  /** Comment la base se montre, et le changement de vue. */
  vue: 'tableau' | 'liste';
  surVue: (vue: 'tableau' | 'liste') => void;
  /** Ce que donnerait le passage à l'autre mode. Une chaîne : l'analyse a échoué, voici pourquoi. */
  analyserConversion: () => Promise<ConversionPreview | string>;
  /** Lance le passage à l'autre mode. Rend le message d'erreur, ou null si c'est fait. */
  convertir: () => Promise<string | null>;
  surFermeture: () => void;
}

const bouton = 'hover:bg-texte/10 focus-visible:bg-texte/20 rounded outline-0 disabled:opacity-40';
const boutonIcone = `text-discret hover:text-texte flex size-7 shrink-0 items-center justify-center ${bouton}`;

/** Champ du nom d'une colonne : renomme à la sortie ou sur Entrée, Échap rend le nom d'avant. */
function NomDeColonne({ champ, surRenommer }: { champ: BaseField; surRenommer: (ancien: string, nouveau: string) => Promise<boolean> }) {
  const [texte, definirTexte] = useState(champ.nom);
  useEffect(() => definirTexte(champ.nom), [champ.nom]);
  const valider = (): void => {
    if (texte.trim() !== champ.nom) {
      void surRenommer(champ.nom, texte).then((ok) => !ok && definirTexte(champ.nom));
    }
  };
  return (
    <input
      aria-label={`Nom de la colonne ${champ.nom}`}
      value={texte}
      onChange={(evenement) => definirTexte(evenement.target.value)}
      onBlur={valider}
      onKeyDown={(evenement) => {
        if (evenement.key === 'Enter') {
          evenement.preventDefault();
          valider();
        } else if (evenement.key === 'Escape') {
          evenement.stopPropagation();
          definirTexte(champ.nom);
        }
      }}
      className="bg-fond min-w-0 flex-1 rounded px-2 py-1 outline-0"
    />
  );
}

/**
 * Paramètres d'une base (docs/spec/base-de-donnees.md), ouverts depuis le menu « ⋮ » de la page : où vivent les
 * lignes (une page par ligne, ou sans pages), et les colonnes (nom, type, valeurs possibles, ordre, retrait, ajout).
 */
export function BaseSettingsDialog({ config, surRenommerChamp, surType, surRetirerChamp, surDeplacerChamp, surAjouterChamp, surValeursPossibles, vue, surVue, analyserConversion, convertir, surFermeture }: BaseSettingsDialogProps) {
  const sansPages = config.lignes === 'tableau';
  const [apercu, definirApercu] = useState<ConversionPreview | 'analyse' | 'conversion' | null>(null);
  const [erreur, definirErreur] = useState<string | null>(null);
  const [nouveau, definirNouveau] = useState<{ nom: string; type: BaseFieldType }>({ nom: '', type: 'texte' });
  const fenetre = useRef<HTMLDivElement>(null);
  useEffect(() => {
    fenetre.current?.querySelector<HTMLElement>('button, input')?.focus();
  }, []);
  // Le mode a changé (conversion faite) : l'aperçu ne dit plus vrai.
  useEffect(() => definirApercu(null), [sansPages]);

  const preparer = async (): Promise<void> => {
    definirErreur(null);
    definirApercu('analyse');
    const resultat = await analyserConversion();
    if (typeof resultat === 'string') {
      definirErreur(resultat);
      definirApercu(null);
    } else {
      definirApercu(resultat);
    }
  };
  const lancer = async (): Promise<void> => {
    definirApercu('conversion');
    const message = await convertir();
    definirErreur(message);
    definirApercu(null);
  };
  const occupe = apercu === 'analyse' || apercu === 'conversion';

  const mode = (cible: 'pages' | 'tableau', titre: string, aide: string) => {
    const actif = (cible === 'tableau') === sansPages;
    return (
      <button
        type="button"
        aria-pressed={actif}
        disabled={occupe}
        onClick={() => !actif && void preparer()}
        className={`flex-1 rounded-md px-3 py-2 text-left outline-0 disabled:opacity-60 ${actif ? 'bg-accent/25' : 'hover:bg-texte/10 focus-visible:bg-texte/20'}`}
      >
        <span className="block font-medium">{titre}</span>
        <span className="text-discret block text-xs">{aide}</span>
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
      <div
        ref={fenetre}
        role="dialog"
        aria-modal="true"
        aria-label="Paramètres de la base"
        onKeyDown={(evenement) => {
          if (evenement.key === 'Escape' && !occupe) {
            evenement.preventDefault();
            evenement.stopPropagation();
            surFermeture();
          }
        }}
        className="border-bordure bg-surface flex max-h-[85vh] w-[34rem] max-w-[calc(100vw-2rem)] flex-col gap-4 overflow-y-auto rounded-lg border p-4 text-sm shadow-xl shadow-black/40"
      >
        <h2 className="text-base font-semibold">Paramètres de la base</h2>

        <section aria-label="Affichage" className="space-y-2">
          <h3 className="text-discret text-xs font-semibold uppercase">Affichage</h3>
          <div className="flex gap-2">
            {(
              [
                ['tableau', 'Tableau', 'Une colonne par champ.'],
                ['liste', 'Liste', 'Comme une liste de tâches : une case, le titre, les champs en dessous.'],
              ] as const
            ).map(([cible, titre, aide]) => (
              <button
                key={cible}
                type="button"
                aria-pressed={vue === cible}
                onClick={() => vue !== cible && surVue(cible)}
                className={`flex-1 rounded-md px-3 py-2 text-left outline-0 ${vue === cible ? 'bg-accent/25' : 'hover:bg-texte/10 focus-visible:bg-texte/20'}`}
              >
                <span className="block font-medium">{titre}</span>
                <span className="text-discret block text-xs">{aide}</span>
              </button>
            ))}
          </div>
        </section>

        <section aria-label="Lignes" className="space-y-2">
          <h3 className="text-discret text-xs font-semibold uppercase">Lignes</h3>
          <div className="flex gap-2">
            {mode('pages', 'Une page par ligne', 'Chaque ligne a sa page, où écrire.')}
            {mode('tableau', 'Lignes sans page', 'Les lignes vivent dans le tableau de cette page.')}
          </div>
          {apercu === 'analyse' && <p className="text-discret">Lecture des lignes…</p>}
          {apercu === 'conversion' && <p className="text-discret">Conversion en cours…</p>}
          {apercu !== null && typeof apercu === 'object' && (
            <div className="bg-fond space-y-2 rounded-md p-3">
              {apercu.versTableau ? (
                <>
                  <p>
                    {apercu.lignes === 0 ? 'Aucune page ne passe dans le tableau.' : `${apercu.lignes} ${apercu.lignes > 1 ? 'pages deviennent des lignes' : 'page devient une ligne'} du tableau.`} Leur texte va
                    dans la colonne « Description », puis elles partent à la corbeille (restaurables 30 jours).
                  </p>
                  {apercu.restent.length > 0 && (
                    <p>
                      Restent des pages, leur texte ne tenant pas dans une cellule : <span className="text-discret">{apercu.restent.join(', ')}</span>.
                    </p>
                  )}
                </>
              ) : (
                <p>
                  {apercu.lignes} {apercu.lignes > 1 ? 'lignes deviennent des pages' : 'ligne devient une page'}, avec leurs valeurs ; la Description de chacune devient le texte de sa page.
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => definirApercu(null)} className={`px-2.5 py-1 ${bouton}`}>
                  Annuler
                </button>
                <button type="button" onClick={() => void lancer()} className="bg-accent/25 hover:bg-accent/40 focus-visible:bg-accent/50 rounded px-2.5 py-1 outline-0">
                  Convertir
                </button>
              </div>
            </div>
          )}
        </section>

        <section aria-label="Colonnes" className="space-y-2">
          <h3 className="text-discret text-xs font-semibold uppercase">Colonnes</h3>
          <ul className="space-y-1">
            {config.champs.map((champ, rang) => (
              <li key={champ.nom} className="flex items-center gap-1">
                <NomDeColonne champ={champ} surRenommer={surRenommerChamp} />
                <select
                  aria-label={`Type de la colonne ${champ.nom}`}
                  value={champ.type}
                  onChange={(evenement) => surType(champ.nom, evenement.target.value as BaseFieldType)}
                  className="bg-fond rounded px-1 py-1 outline-0"
                >
                  {typesDeChamp.map(({ type, libelle }) => (
                    <option key={type} value={type}>
                      {libelle}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  aria-label={`Valeurs possibles de ${champ.nom}`}
                  title="Valeurs possibles"
                  disabled={champ.type !== 'choix'}
                  onClick={(evenement) => surValeursPossibles(champ.nom, evenement.clientX, evenement.clientY)}
                  className={boutonIcone}
                >
                  <List className="size-4" aria-hidden="true" />
                </button>
                <button type="button" aria-label={`Monter la colonne ${champ.nom}`} disabled={rang === 0} onClick={() => surDeplacerChamp(champ.nom, -1)} className={boutonIcone}>
                  <ArrowUp className="size-4" aria-hidden="true" />
                </button>
                <button type="button" aria-label={`Descendre la colonne ${champ.nom}`} disabled={rang === config.champs.length - 1} onClick={() => surDeplacerChamp(champ.nom, 1)} className={boutonIcone}>
                  <ArrowDown className="size-4" aria-hidden="true" />
                </button>
                <button type="button" aria-label={`Retirer la colonne ${champ.nom}`} onClick={() => surRetirerChamp(champ.nom)} className={boutonIcone}>
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          <form
            aria-label="Nouvelle colonne"
            onSubmit={(evenement) => {
              evenement.preventDefault();
              if (nouveau.nom.trim() !== '') {
                surAjouterChamp(nouveau.nom, nouveau.type);
                definirNouveau({ nom: '', type: nouveau.type });
              }
            }}
            className="flex items-center gap-1"
          >
            <input
              aria-label="Nom de la nouvelle colonne"
              placeholder="Nouvelle colonne"
              value={nouveau.nom}
              onChange={(evenement) => definirNouveau({ ...nouveau, nom: evenement.target.value })}
              className="bg-fond min-w-0 flex-1 rounded px-2 py-1 outline-0"
            />
            <select
              aria-label="Type de la nouvelle colonne"
              value={nouveau.type}
              onChange={(evenement) => definirNouveau({ ...nouveau, type: evenement.target.value as BaseFieldType })}
              className="bg-fond rounded px-1 py-1 outline-0"
            >
              {typesDeChamp.map(({ type, libelle }) => (
                <option key={type} value={type}>
                  {libelle}
                </option>
              ))}
            </select>
            <button type="submit" aria-label="Ajouter la colonne" className={boutonIcone}>
              <Plus className="size-4" aria-hidden="true" />
            </button>
          </form>
        </section>

        {erreur !== null && (
          <p role="alert" className="text-erreur">
            {erreur}
          </p>
        )}
        <div className="flex justify-end">
          <button type="button" disabled={occupe} onClick={surFermeture} className={`px-3 py-1.5 ${bouton}`}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
