import type { AiPageFunction, AiPrice, AiProvider, AiSettings } from '@notes/core';
import { BarChart3, Check, CircleSlash, Cpu, KeyRound, RefreshCw, RotateCcw, Trash2, TriangleAlert } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { consignesParDefaut, libellesDesFonctions } from '../../../../shared/ai-contract';
import type { AiApiModelView, AiState } from '../../../../shared/ai-contract';
import { api } from '../../lib/ipc';
import { ExportSelect } from '../export/ExportSelect';
import { TextField } from '../settings/TextField';
import { libelleDeDollars } from './ai-labels';

const boutonSecondaire =
  'bg-texte/10 hover:bg-texte/20 focus-visible:bg-accent/40 inline-flex h-8 shrink-0 items-center gap-2 rounded-md px-3 text-sm leading-none font-medium outline-0 aria-disabled:opacity-50';
const boutonPrincipal =
  'bg-accent text-fond hover:brightness-110 focus-visible:brightness-125 inline-flex h-8 shrink-0 items-center gap-2 rounded-md px-3 text-sm leading-none font-medium outline-0 aria-disabled:opacity-50';
const champ = 'bg-fond border-bordure focus:outline-accent rounded-md border px-2 py-1 text-sm focus:outline-2 focus:outline-offset-1';

const fonctions: readonly AiPageFunction[] = ['relecture', 'mise-au-propre', 'memo'];
const fournisseurs: readonly { cle: AiProvider; libelle: string }[] = [
  { cle: 'ollama', libelle: 'Ce poste (Ollama)' },
  { cle: 'litellm', libelle: 'LiteLLM (payant)' },
];

/** Un nombre saisi à la française (« 0,75 »), null s'il n'en est pas un. */
function lireMontant(texte: string): number | null {
  const valeur = Number(texte.trim().replace(',', '.'));
  return texte.trim() === '' || !Number.isFinite(valeur) || valeur < 0 ? null : valeur;
}
const ecrireMontant = (valeur: number): string => String(Math.round(valeur * 10000) / 10000).replace('.', ',');
const go = (octets: number): string => `${Math.round((octets / 1024 ** 3) * 10) / 10} Go`.replace('.', ',');
/** Une adresse en http vers une autre machine : la clé y passe en clair sur le réseau. */
const clairSurLeReseau = (adresse: string): boolean => /^http:\/\//.test(adresse) && !/^http:\/\/(localhost|127\.|\[::1\])/.test(adresse);

/** Modèles proposés pour une fonction. Pour Ollama, « Automatique » en tête, puis ceux qui conviennent à la carte. */
function choixDeModeles(etat: AiState, fournisseur: AiProvider, actuel: string): { cle: string; libelle: string }[] {
  if (fournisseur === 'ollama') {
    const choix = [
      { cle: '', libelle: etat.local.automatique === null ? 'Automatique (aucun ne convient)' : `Automatique : ${etat.local.automatique}` },
      ...etat.local.modeles.filter((modele) => modele.utilisable).map((modele) => ({ cle: modele.nom, libelle: modele.nom })),
    ];
    if (actuel !== '' && !choix.some((option) => option.cle === actuel)) {
      choix.push({ cle: actuel, libelle: `${actuel} (ne convient pas)` });
    }
    return choix;
  }
  const liste = (etat.modelesLitellm ?? []).map((modele) => ({ cle: modele.nom, libelle: modele.nom }));
  if (actuel !== '' && !liste.some((option) => option.cle === actuel)) {
    liste.unshift({ cle: actuel, libelle: `${actuel} (introuvable)` });
  }
  if (actuel === '') {
    liste.unshift({ cle: '', libelle: liste.length === 0 ? 'Aucun modèle disponible' : 'Choisir un modèle' });
  }
  return liste;
}

const sources: Record<NonNullable<AiApiModelView['source']>, string> = {
  reglages: 'Tarif saisi ici.',
  litellm: 'Tarif donné par LiteLLM.',
  notes: 'Tarif relevé par Notes chez OpenAI, faute de tarif chez LiteLLM.',
};

/** Tarif d'un modèle de LiteLLM, en dollars par million de tokens : celui de LiteLLM, corrigeable. */
function Tarif({ modele, vue, saisi, surChangement }: { modele: string; vue: AiApiModelView | null; saisi: AiPrice | null; surChangement: (tarif: AiPrice | null) => void }) {
  const depart = saisi ?? vue?.tarif ?? null;
  const [entree, definirEntree] = useState(() => (depart === null ? '' : ecrireMontant(depart.entree)));
  const [sortie, definirSortie] = useState(() => (depart === null ? '' : ecrireMontant(depart.sortie)));
  const id = useId();
  const mettreAJour = (nouvelleEntree: string, nouvelleSortie: string): void => {
    const e = lireMontant(nouvelleEntree);
    const s = lireMontant(nouvelleSortie);
    // Un tarif identique à celui de LiteLLM n'est pas gardé : il suivra LiteLLM.
    const reference = vue?.source === 'reglages' ? null : (vue?.tarif ?? null);
    surChangement(e === null || s === null || (reference !== null && reference.entree === e && reference.sortie === s) ? null : { entree: e, sortie: s });
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
        {saisi !== null ? sources.reglages : vue?.source != null ? sources[vue.source] : 'Aucun tarif connu : sans lui, le coût ne peut pas être estimé.'}
      </p>
    </div>
  );
}

/** Ce que la carte du poste permet : IA locale possible ou non, et pourquoi. */
function CetteMachine({ etat }: { etat: AiState }) {
  const { carte, local } = etat;
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-2">
        <Cpu className="text-discret size-4 shrink-0" aria-hidden="true" />
        {carte === null
          ? 'Aucune carte graphique vue (ou Ollama tourne sur une autre machine).'
          : `${carte.nom}${carte.vram === null ? ', mémoire vidéo inconnue' : `, ${go(carte.vram)} de mémoire vidéo`}${carte.dediee ? '' : ' (carte intégrée)'}`}
      </p>
      <p role="status" className={`flex items-start gap-2 ${local.disponible ? 'text-succes' : 'text-alerte'}`}>
        {local.disponible ? <Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <CircleSlash className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
        {local.disponible ? `IA locale possible. Notes choisit ${local.automatique ?? ''}.` : local.raison}
      </p>
      {local.conseil !== null && (
        <p className="text-discret text-xs">
          Modèle conseillé pour cette carte : <span className="font-mono">ollama pull {local.conseil}</span>
        </p>
      )}
      {local.modeles.length > 0 && (
        <ul className="text-xs" aria-label="Modèles installés dans Ollama">
          {local.modeles.map((modele) => (
            <li key={modele.nom} className="flex gap-2 py-0.5">
              <span className={`min-w-36 font-mono ${modele.utilisable ? '' : 'text-discret line-through'}`}>{modele.nom}</span>
              <span className={modele.utilisable ? 'text-succes' : 'text-discret'}>{modele.utilisable ? (modele.nom === local.automatique ? 'choisi par Notes' : 'convient') : modele.raison}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Fonctions IA dans les réglages (README §12) : ce que la carte permet, Ollama,
 * LiteLLM en option, modèle par fonction, tarifs, seuil de dépense, consignes.
 * Tout est propre à ce poste ; la clé de LiteLLM est chiffrée par le trousseau.
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
    recevoir(await api.enregistrerReglagesIa(brouillon), true);
    definirMessage('Réglages enregistrés.');
  };
  const verifier = async (): Promise<void> => {
    definirVerification(true);
    // Les adresses saisies sont enregistrées d'abord : ce sont elles qu'on vérifie.
    recevoir(modifie ? await api.enregistrerReglagesIa(brouillon) : await api.etatIa(), true);
    definirVerification(false);
  };
  const boutonVerifier = (
    <button type="button" aria-disabled={verification} onClick={() => !verification && void verifier()} className={`${boutonSecondaire} h-9`}>
      <RefreshCw className={`size-4 ${verification ? 'animate-spin' : ''}`} aria-hidden="true" />
      Vérifier
    </button>
  );
  const modelesLitellmChoisis = [...new Set(fonctions.map((fonction) => brouillon.modeles[fonction]).filter((choix) => choix.fournisseur === 'litellm' && choix.modele !== '').map((choix) => choix.modele))];
  const cleValide = /^[\x21-\x7e]{8,500}$/.test(cle.trim());

  return (
    <section aria-labelledby="titre-ia" className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="titre-ia" className="text-xl font-semibold">
            Fonctions IA
          </h2>
          <p className="text-discret mt-1 text-sm">
            Relecture et mise au propre d’une page, par l’icône en haut de la page. Par défaut, un modèle tourne sur ce poste avec Ollama, sans rien envoyer sur
            Internet ; Notes le choisit selon la carte graphique. LiteLLM est possible en option, payant. Ces réglages sont propres à ce poste.
          </p>
        </div>
        <button type="button" onClick={surHistorique} className={boutonSecondaire}>
          <BarChart3 className="size-4" aria-hidden="true" />
          Historique
        </button>
      </div>

      <div className="bg-surface space-y-3 rounded-lg p-4 text-sm">
        <h3 className="font-medium">Ce poste</h3>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <TextField libelle="Adresse d’Ollama" valeur={brouillon.adresseOllama} surChangement={(adresseOllama) => changer({ adresseOllama })} />
          </div>
          {boutonVerifier}
        </div>
        {etat.ollama === 'injoignable' ? (
          <div className="space-y-1">
            <p role="status" className="text-alerte">
              Ollama ne répond pas à cette adresse.
            </p>
            <p className="text-discret text-xs">
              Pour l’installer : <span className="font-mono">curl -fsSL https://ollama.com/install.sh | sh</span>
            </p>
          </div>
        ) : (
          <CetteMachine etat={etat} />
        )}
      </div>

      <div className="bg-surface space-y-3 rounded-lg p-4 text-sm">
        <h3 className="font-medium">LiteLLM, en option</h3>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <TextField
              libelle="Adresse de LiteLLM"
              valeur={brouillon.adresseLitellm}
              indication="http://serveur:4000"
              surChangement={(adresseLitellm) => changer({ adresseLitellm })}
            />
          </div>
          {boutonVerifier}
        </div>
        {clairSurLeReseau(brouillon.adresseLitellm) && (
          <p className="text-alerte flex items-start gap-2 text-xs">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            En http, la clé passe en clair sur le réseau local. https est préférable si LiteLLM le permet.
          </p>
        )}
        {etat.cleLitellm === 'absent' ? (
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <TextField libelle="Clé de LiteLLM" type="password" valeur={cle} surChangement={definirCle} aide="Chiffrée par le trousseau du système, jamais écrite en clair." />
            </div>
            <button
              type="button"
              aria-disabled={!cleValide}
              onClick={() => {
                if (cleValide) {
                  void api.enregistrerCleLitellm({ cle }).then((nouveau) => {
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
              {etat.cleLitellm === 'enregistre' ? 'Clé enregistrée, chiffrée par le trousseau du système.' : 'Clé gardée jusqu’à la fermeture de Notes : sans trousseau, elle sera redemandée.'}{' '}
              {etat.reglages.adresseLitellm === '' ? (
                'Il reste l’adresse à régler.'
              ) : etat.modelesLitellm === null ? (
                <span className="text-alerte">LiteLLM ne répond pas ou refuse la clé.</span>
              ) : (
                `${etat.modelesLitellm.length} modèle${etat.modelesLitellm.length > 1 ? 's' : ''} disponible${etat.modelesLitellm.length > 1 ? 's' : ''}.`
              )}
            </p>
            <button type="button" onClick={() => void api.oublierCleLitellm().then((nouveau) => recevoir(nouveau, false))} className={boutonSecondaire}>
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
        {modelesLitellmChoisis.length > 0 && (
          <div className="space-y-3 pt-2">
            <h4 className="text-discret text-xs font-medium">Tarifs</h4>
            {modelesLitellmChoisis.map((modele) => (
              <Tarif
                key={modele}
                modele={modele}
                vue={etat.modelesLitellm?.find((candidat) => candidat.nom === modele) ?? null}
                saisi={brouillon.tarifs[modele] ?? null}
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
