import type { AiPageFunction, AiSettings } from '@notes/core';
import { BarChart3, Check, CircleSlash, Cpu, RefreshCw, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { consignesParDefaut, libellesDesFonctions } from '../../../../shared/ai-contract';
import type { AiState } from '../../../../shared/ai-contract';
import { api } from '../../lib/ipc';
import { ExportSelect } from '../export/ExportSelect';
import { TextField } from '../settings/TextField';

const boutonSecondaire =
  'bg-texte/10 hover:bg-texte/20 focus-visible:bg-accent/40 inline-flex h-8 shrink-0 items-center gap-2 rounded-md px-3 text-sm leading-none font-medium outline-0 aria-disabled:opacity-50';
const boutonPrincipal =
  'bg-accent text-fond hover:brightness-110 focus-visible:brightness-125 inline-flex h-8 shrink-0 items-center gap-2 rounded-md px-3 text-sm leading-none font-medium outline-0 aria-disabled:opacity-50';
const champ = 'bg-fond border-bordure focus:outline-accent rounded-md border px-2 py-1 text-sm focus:outline-2 focus:outline-offset-1';

const fonctions: readonly AiPageFunction[] = ['relecture', 'mise-au-propre', 'memo'];

const go = (octets: number): string => `${Math.round((octets / 1024 ** 3) * 10) / 10} Go`.replace('.', ',');

/** Modèles proposés pour une fonction : « Automatique » en tête, puis ceux qui conviennent à la carte. */
function choixDeModeles(etat: AiState, actuel: string): { cle: string; libelle: string }[] {
  const choix = [
    { cle: '', libelle: etat.local.automatique === null ? 'Automatique (aucun ne convient)' : `Automatique : ${etat.local.automatique}` },
    ...etat.local.modeles.filter((modele) => modele.utilisable).map((modele) => ({ cle: modele.nom, libelle: modele.nom })),
  ];
  if (actuel !== '' && !choix.some((option) => option.cle === actuel)) {
    choix.push({ cle: actuel, libelle: `${actuel} (ne convient pas)` });
  }
  return choix;
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
 * modèle par fonction, consignes. Tout est propre à ce poste.
 */
export function AiPanel({ surHistorique }: { surHistorique: () => void }) {
  const [etat, definirEtat] = useState<AiState | null>(null);
  const [brouillon, definirBrouillon] = useState<AiSettings | null>(null);
  const [message, definirMessage] = useState<string | null>(null);
  const [verification, definirVerification] = useState(false);

  const recevoir = (nouveau: AiState, remplacerBrouillon: boolean): void => {
    definirEtat(nouveau);
    if (remplacerBrouillon) {
      definirBrouillon(nouveau.reglages);
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

  return (
    <section aria-labelledby="titre-ia" className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="titre-ia" className="text-xl font-semibold">
            Fonctions IA
          </h2>
          <p className="text-discret mt-1 text-sm">
            Relecture et mise au propre d’une page, par l’icône en haut de la page. Par défaut, un modèle tourne sur ce poste avec Ollama, sans rien envoyer sur
            Internet ; Notes le choisit selon la carte graphique. Pour passer par un autre outil, la fenêtre de la page copie la consigne et le texte. Ces réglages
            sont propres à ce poste.
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

      <div className="bg-surface space-y-4 rounded-lg p-4 text-sm">
        <h3 className="font-medium">Modèle de chaque fonction</h3>
        {fonctions.map((fonction) => {
          const choix = brouillon.modeles[fonction];
          return (
            <div key={fonction} className="flex flex-wrap items-center gap-2">
              <span className="min-w-40">{libellesDesFonctions[fonction]}</span>
              <ExportSelect
                libelle={`Modèle pour ${libellesDesFonctions[fonction]}`}
                valeur={choix.modele}
                choix={choixDeModeles(etat, choix.modele)}
                surChoix={(modele) => changer({ modeles: { ...brouillon.modeles, [fonction]: { modele } } })}
              />
            </div>
          );
        })}
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
