import type { AiPageFunction, AiPrice, AiProvider, AiSettings } from '@notes/core';
import { BarChart3, Check, KeyRound, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { consignesParDefaut, libellesDesFonctions } from '../../../../shared/ai-contract';
import type { AiState } from '../../../../shared/ai-contract';
import { api } from '../../lib/ipc';
import { ExportSelect } from '../export/ExportSelect';
import { TextField } from '../settings/TextField';
import { libelleDeDollars } from './ai-labels';

const boutonSecondaire =
  'bg-texte/10 hover:bg-texte/20 focus-visible:bg-accent/40 inline-flex h-8 shrink-0 items-center gap-2 rounded-md px-3 text-sm leading-none font-medium outline-0';
const boutonPrincipal =
  'bg-accent text-fond hover:brightness-110 focus-visible:brightness-125 inline-flex h-8 shrink-0 items-center gap-2 rounded-md px-3 text-sm leading-none font-medium outline-0 aria-disabled:opacity-50';
const champ = 'bg-fond border-bordure focus:outline-accent rounded-md border px-2 py-1 text-sm focus:outline-2 focus:outline-offset-1';

const fonctions: readonly AiPageFunction[] = ['relecture', 'mise-au-propre'];
const fournisseurs: readonly { cle: AiProvider; libelle: string }[] = [
  { cle: 'ollama', libelle: 'Ce poste (Ollama)' },
  { cle: 'openai', libelle: 'OpenAI (payant)' },
];

/** Un nombre saisi à la française (« 0,75 »), null s'il n'en est pas un. */
function lireMontant(texte: string): number | null {
  const valeur = Number(texte.trim().replace(',', '.'));
  return texte.trim() === '' || !Number.isFinite(valeur) || valeur < 0 ? null : valeur;
}
const ecrireMontant = (valeur: number): string => String(valeur).replace('.', ',');

/** Modèles proposés pour une fonction : ceux du fournisseur, plus le modèle réglé s'il n'y est plus. */
function choixDeModeles(etat: AiState, fournisseur: AiProvider, actuel: string): { cle: string; libelle: string }[] {
  const liste = fournisseur === 'ollama' ? etat.modelesOllama : (etat.modelesOpenAi ?? []);
  const choix = liste.map((modele) => ({ cle: modele, libelle: modele }));
  if (actuel !== '' && !liste.includes(actuel)) {
    choix.unshift({ cle: actuel, libelle: `${actuel} (introuvable)` });
  }
  if (actuel === '') {
    choix.unshift({ cle: '', libelle: liste.length === 0 ? 'Aucun modèle disponible' : 'Choisir un modèle' });
  }
  return choix;
}

/** Tarif d'un modèle d'OpenAI : saisi en dollars par million de tokens, prérempli avec celui que Notes connaît. */
function Tarif({ modele, etat, brouillon, surChangement }: { modele: string; etat: AiState; brouillon: AiSettings; surChangement: (tarif: AiPrice | null) => void }) {
  const connu = etat.tarifsConnus[modele.replace(/-\d{4}-\d{2}-\d{2}$/, '')] ?? etat.tarifsConnus[modele] ?? null;
  const saisi = brouillon.tarifs[modele] ?? null;
  const [entree, definirEntree] = useState(() => (saisi ?? connu) === null ? '' : ecrireMontant((saisi ?? connu)!.entree));
  const [sortie, definirSortie] = useState(() => (saisi ?? connu) === null ? '' : ecrireMontant((saisi ?? connu)!.sortie));
  const id = useId();
  const mettreAJour = (nouvelleEntree: string, nouvelleSortie: string): void => {
    const e = lireMontant(nouvelleEntree);
    const s = lireMontant(nouvelleSortie);
    // Un tarif identique à celui de Notes n'est pas gardé : il suivra le relevé de Notes.
    surChangement(e === null || s === null || (connu !== null && connu.entree === e && connu.sortie === s) ? null : { entree: e, sortie: s });
  };
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="min-w-40 font-mono text-xs">{modele}</span>
        <label htmlFor={`${id}-e`} className="text-discret text-xs">
          entrée
        </label>
        <input
          id={`${id}-e`}
          inputMode="decimal"
          value={entree}
          onChange={(evenement) => {
            definirEntree(evenement.target.value);
            mettreAJour(evenement.target.value, sortie);
          }}
          className={`${champ} w-20`}
        />
        <label htmlFor={`${id}-s`} className="text-discret text-xs">
          sortie
        </label>
        <input
          id={`${id}-s`}
          inputMode="decimal"
          value={sortie}
          onChange={(evenement) => {
            definirSortie(evenement.target.value);
            mettreAJour(entree, evenement.target.value);
          }}
          className={`${champ} w-20`}
        />
        <span className="text-discret text-xs">$ par million de tokens</span>
      </div>
      <p className="text-discret text-xs">
        {saisi !== null
          ? 'Tarif saisi ici.'
          : connu !== null
            ? `Tarif relevé par Notes le ${etat.dateDesTarifs.split('-').reverse().join('/')}. À corriger si OpenAI l’a changé.`
            : 'Notes ne connaît pas ce tarif : sans lui, le coût ne peut pas être estimé.'}
      </p>
    </div>
  );
}

/**
 * Fonctions IA dans les réglages (README §12) : Ollama sur ce poste, OpenAI
 * en option, modèle par fonction, tarifs, seuil de dépense, consignes. Tout
 * est propre à ce poste ; la clé d'OpenAI est chiffrée par le trousseau.
 */
export function AiPanel({ surHistorique }: { surHistorique: () => void }) {
  const [etat, definirEtat] = useState<AiState | null>(null);
  const [brouillon, definirBrouillon] = useState<AiSettings | null>(null);
  const [cle, definirCle] = useState('');
  const [message, definirMessage] = useState<string | null>(null);
  const [verification, definirVerification] = useState(false);
  const [seuil, definirSeuil] = useState('');

  const recevoir = (nouveau: AiState, remplacerBrouillon: boolean): void => {
    definirEtat(nouveau);
    if (remplacerBrouillon) {
      definirBrouillon(nouveau.reglages);
      definirSeuil(nouveau.reglages.seuilMensuelUsd === null ? '' : ecrireMontant(nouveau.reglages.seuilMensuelUsd));
    }
  };

  useEffect(() => {
    void api.etatIa().then((nouveau) => recevoir(nouveau, true));
  }, []);

  if (etat === null || brouillon === null) {
    return null;
  }
  const modifie = JSON.stringify(brouillon) !== JSON.stringify(etat.reglages);
  const changer = (modification: Partial<AiSettings>): void => {
    definirBrouillon({ ...brouillon, ...modification });
    definirMessage(null);
  };
  const enregistrer = async (): Promise<void> => {
    const nouveau = await api.enregistrerReglagesIa(brouillon);
    recevoir(nouveau, true);
    definirMessage('Réglages enregistrés.');
  };
  const verifier = async (): Promise<void> => {
    definirVerification(true);
    // L'adresse saisie est enregistrée d'abord : c'est elle qu'on vérifie.
    const nouveau = modifie ? await api.enregistrerReglagesIa(brouillon) : await api.etatIa();
    recevoir(nouveau, true);
    definirVerification(false);
  };
  const modelesOpenAi = [...new Set(fonctions.map((fonction) => brouillon.modeles[fonction]).filter((choix) => choix.fournisseur === 'openai' && choix.modele !== '').map((choix) => choix.modele))];

  return (
    <section aria-labelledby="titre-ia" className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="titre-ia" className="text-xl font-semibold">
            Fonctions IA
          </h2>
          <p className="text-discret mt-1 text-sm">
            Relecture et mise au propre d’une page, par l’icône en haut de la page. Par défaut, un modèle tourne sur ce poste avec Ollama, sans rien envoyer sur
            Internet. OpenAI est possible en option, payant. Ces réglages sont propres à ce poste.
          </p>
        </div>
        <button type="button" onClick={surHistorique} className={boutonSecondaire}>
          <BarChart3 className="size-4" aria-hidden="true" />
          Historique
        </button>
      </div>

      <div className="bg-surface space-y-3 rounded-lg p-4 text-sm">
        <h3 className="font-medium">Ollama, sur ce poste</h3>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <TextField libelle="Adresse" valeur={brouillon.adresseOllama} surChangement={(adresseOllama) => changer({ adresseOllama })} />
          </div>
          <button type="button" aria-disabled={verification} onClick={() => !verification && void verifier()} className={`${boutonSecondaire} h-9`}>
            <RefreshCw className={`size-4 ${verification ? 'animate-spin' : ''}`} aria-hidden="true" />
            Vérifier
          </button>
        </div>
        <p role="status" className={etat.ollama === 'joignable' ? 'text-succes' : 'text-alerte'}>
          {etat.ollama === 'joignable'
            ? `Ollama répond, ${etat.modelesOllama.length} modèle${etat.modelesOllama.length > 1 ? 's' : ''} installé${etat.modelesOllama.length > 1 ? 's' : ''}.`
            : 'Ollama ne répond pas à cette adresse.'}
        </p>
        {etat.ollama === 'injoignable' && (
          <p className="text-discret text-xs">
            Pour l’installer : <span className="font-mono">curl -fsSL https://ollama.com/install.sh | sh</span>, puis télécharger un modèle, par exemple{' '}
            <span className="font-mono">ollama pull ministral-3:8b</span>.
          </p>
        )}
      </div>

      <div className="bg-surface space-y-3 rounded-lg p-4 text-sm">
        <h3 className="font-medium">OpenAI, en option</h3>
        {etat.cleOpenAi === 'absent' ? (
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <TextField libelle="Clé d’API" type="password" valeur={cle} surChangement={definirCle} indication="sk-…" aide="Chiffrée par le trousseau du système, jamais écrite en clair." />
            </div>
            <button
              type="button"
              aria-disabled={!/^sk-[A-Za-z0-9_-]{16,}$/.test(cle.trim())}
              onClick={() => {
                if (/^sk-[A-Za-z0-9_-]{16,}$/.test(cle.trim())) {
                  void api.enregistrerCleOpenAi({ cle }).then((nouveau) => {
                    definirCle('');
                    recevoir(nouveau, false);
                  });
                }
              }}
              className={`${boutonPrincipal} mb-5 h-9`}
            >
              <KeyRound className="size-4" aria-hidden="true" />
              Enregistrer la clé
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p role="status">
              {etat.cleOpenAi === 'enregistre' ? 'Clé enregistrée, chiffrée par le trousseau du système.' : 'Clé gardée jusqu’à la fermeture de Notes : sans trousseau, elle sera redemandée.'}{' '}
              {etat.modelesOpenAi === null ? <span className="text-alerte">OpenAI ne répond pas ou refuse la clé.</span> : `${etat.modelesOpenAi.length} modèle${etat.modelesOpenAi.length > 1 ? 's' : ''} disponible${etat.modelesOpenAi.length > 1 ? 's' : ''}.`}
            </p>
            <button type="button" onClick={() => void api.oublierCleOpenAi().then((nouveau) => recevoir(nouveau, false))} className={boutonSecondaire}>
              <Trash2 className="size-4" aria-hidden="true" />
              Oublier la clé
            </button>
          </div>
        )}
      </div>

      <div className="bg-surface space-y-4 rounded-lg p-4 text-sm">
        <h3 className="font-medium">Modèle de chaque fonction</h3>
        {fonctions.map((fonction) => {
          const choix = brouillon.modeles[fonction];
          return (
            <div key={fonction} className="flex flex-wrap items-center gap-2">
              <span className="min-w-40">{libellesDesFonctions[fonction]}</span>
              <ExportSelect
                libelle={`Fournisseur pour ${libellesDesFonctions[fonction]}`}
                valeur={choix.fournisseur}
                choix={fournisseurs}
                surChoix={(fournisseur) => changer({ modeles: { ...brouillon.modeles, [fonction]: { fournisseur, modele: '' } } })}
              />
              <ExportSelect
                libelle={`Modèle pour ${libellesDesFonctions[fonction]}`}
                valeur={choix.modele}
                choix={choixDeModeles(etat, choix.fournisseur, choix.modele)}
                surChoix={(modele) => changer({ modeles: { ...brouillon.modeles, [fonction]: { ...choix, modele } } })}
              />
            </div>
          );
        })}
        {modelesOpenAi.length > 0 && (
          <div className="space-y-3 pt-2">
            <h4 className="text-discret text-xs font-medium">Tarifs OpenAI</h4>
            {modelesOpenAi.map((modele) => (
              <Tarif
                key={modele}
                modele={modele}
                etat={etat}
                brouillon={brouillon}
                surChangement={(tarif) => {
                  const tarifs = { ...brouillon.tarifs };
                  if (tarif === null) {
                    delete tarifs[modele];
                  } else {
                    tarifs[modele] = tarif;
                  }
                  changer({ tarifs });
                }}
              />
            ))}
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="seuil-ia" className="min-w-40">
                Alerte au-delà de
              </label>
              <input
                id="seuil-ia"
                inputMode="decimal"
                value={seuil}
                placeholder="aucune"
                onChange={(evenement) => {
                  definirSeuil(evenement.target.value);
                  changer({ seuilMensuelUsd: lireMontant(evenement.target.value) });
                }}
                className={`${champ} w-24`}
              />
              <span className="text-discret text-xs">$ par mois. Ce mois-ci : {libelleDeDollars(etat.depenseDuMoisUsd)}.</span>
            </div>
          </div>
        )}
      </div>

      <div className="bg-surface space-y-4 rounded-lg p-4 text-sm">
        <h3 className="font-medium">Consignes données au modèle</h3>
        {fonctions.map((fonction) => (
          <div key={fonction} className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor={`consigne-${fonction}`}>{libellesDesFonctions[fonction]}</label>
              {brouillon.consignes[fonction] !== null && (
                <button type="button" onClick={() => changer({ consignes: { ...brouillon.consignes, [fonction]: null } })} className={boutonSecondaire}>
                  <RotateCcw className="size-4" aria-hidden="true" />
                  Revenir à celle de Notes
                </button>
              )}
            </div>
            <textarea
              id={`consigne-${fonction}`}
              rows={6}
              spellCheck={false}
              value={brouillon.consignes[fonction] ?? consignesParDefaut[fonction]}
              onChange={(evenement) =>
                changer({ consignes: { ...brouillon.consignes, [fonction]: evenement.target.value === consignesParDefaut[fonction] ? null : evenement.target.value } })
              }
              className={`${champ} w-full resize-y font-mono text-xs leading-5`}
            />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-end gap-3">
        {message !== null && (
          <span role="status" className="text-succes flex items-center gap-1 text-sm">
            <Check className="size-4" aria-hidden="true" />
            {message}
          </span>
        )}
        <button type="button" aria-disabled={!modifie} onClick={() => modifie && void enregistrer()} className={boutonPrincipal}>
          Enregistrer
        </button>
      </div>
    </section>
  );
}
