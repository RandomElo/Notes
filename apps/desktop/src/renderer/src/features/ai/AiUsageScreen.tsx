import type { AiRun, UsageBucket, UsagePeriod } from '@notes/core';
import { useEffect, useState } from 'react';
import { libellesDesFonctions } from '../../../../shared/ai-contract';
import type { AiUsageView } from '../../../../shared/ai-contract';
import { api } from '../../lib/ipc';
import { useStoredState } from '../../state/useStoredState';
import { libelleDEcart, libelleDeDollars, libelleDeTokens } from './ai-labels';

type Mesure = 'cout' | 'tokens' | 'appels';

const periodes: readonly { cle: UsagePeriod; libelle: string }[] = [
  { cle: 'jour', libelle: 'Jours' },
  { cle: 'semaine', libelle: 'Semaines' },
  { cle: 'mois', libelle: 'Mois' },
  { cle: 'annee', libelle: 'Années' },
];
const mesures: readonly { cle: Mesure; libelle: string }[] = [
  { cle: 'cout', libelle: 'Dépense' },
  { cle: 'tokens', libelle: 'Tokens' },
  { cle: 'appels', libelle: 'Appels' },
];
const estPeriode = (valeur: unknown): valeur is UsagePeriod => periodes.some((periode) => periode.cle === valeur);
const estMesure = (valeur: unknown): valeur is Mesure => mesures.some((mesure) => mesure.cle === valeur);

const valeurDe = (total: UsageBucket, mesure: Mesure): number => (mesure === 'cout' ? total.coutUsd : mesure === 'tokens' ? total.entree + total.sortie : total.appels);
const libelleDeValeur = (valeur: number, mesure: Mesure): string =>
  mesure === 'cout' ? libelleDeDollars(valeur) : mesure === 'tokens' ? libelleDeTokens(valeur) : `${valeur} appel${valeur > 1 ? 's' : ''}`;

function libelleDePeriode(debut: number, periode: UsagePeriod, court: boolean): string {
  const date = new Date(debut);
  switch (periode) {
    case 'jour':
      return court ? String(date.getDate()) : date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    case 'semaine':
      return court ? date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'numeric' }) : `semaine du ${date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`;
    case 'mois':
      return date.toLocaleDateString('fr-FR', { month: court ? 'short' : 'long', ...(court ? {} : { year: 'numeric' }) });
    default:
      return String(date.getFullYear());
  }
}

/** Arrondi vers le haut à une valeur ronde, pour le haut de l'axe. */
function hautDeLAxe(maximum: number): number {
  if (maximum <= 0) {
    return 1;
  }
  const puissance = 10 ** Math.floor(Math.log10(maximum));
  return ([1, 2, 2.5, 5, 10].find((pas) => pas * puissance >= maximum) ?? 10) * puissance;
}

/** Barres d'une seule mesure par période, infobulle au survol ou au focus clavier. */
function Barres({ totaux, periode, mesure }: { totaux: UsageBucket[]; periode: UsagePeriod; mesure: Mesure }) {
  const [survolee, definirSurvolee] = useState<number | null>(null);
  const largeur = 720;
  const hauteur = 200;
  const marge = { haut: 12, bas: 24, gauche: 64, droite: 8 };
  const zone = { largeur: largeur - marge.gauche - marge.droite, hauteur: hauteur - marge.haut - marge.bas };
  const haut = hautDeLAxe(Math.max(...totaux.map((total) => valeurDe(total, mesure))));
  const pas = zone.largeur / totaux.length;
  const barre = Math.max(2, Math.min(28, pas - 2));
  const y = (valeur: number): number => marge.haut + zone.hauteur - (valeur / haut) * zone.hauteur;
  // Une étiquette d'abscisse sur quelques barres seulement, pour qu'elles ne se chevauchent pas.
  const tousLes = Math.ceil(totaux.length / 12);
  const choisie = survolee === null ? null : totaux[survolee]!;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${largeur} ${hauteur}`} className="h-auto w-full" role="img" aria-label={`${mesures.find((m) => m.cle === mesure)!.libelle} par période`}>
        {[0, 0.5, 1].map((part) => (
          <g key={part}>
            <line x1={marge.gauche} x2={largeur - marge.droite} y1={y(haut * part)} y2={y(haut * part)} className="stroke-texte/10" strokeWidth={1} />
            <text x={marge.gauche - 6} y={y(haut * part)} dy="0.32em" textAnchor="end" className="fill-discret text-[10px]">
              {libelleDeValeur(haut * part, mesure)}
            </text>
          </g>
        ))}
        {totaux.map((total, index) => {
          const valeur = valeurDe(total, mesure);
          const x = marge.gauche + index * pas + (pas - barre) / 2;
          const sommet = y(valeur);
          const h = marge.haut + zone.hauteur - sommet;
          return (
            <g key={total.debut}>
              {/* Haut arrondi, pied droit sur la ligne de base. */}
              {valeur > 0 && (
                <path
                  d={`M${x},${sommet + h} V${sommet + Math.min(4, h)} Q${x},${sommet} ${x + Math.min(4, barre / 2)},${sommet} H${x + barre - Math.min(4, barre / 2)} Q${x + barre},${sommet} ${x + barre},${sommet + Math.min(4, h)} V${sommet + h} Z`}
                  className={survolee === null || survolee === index ? 'fill-accent' : 'fill-accent/45'}
                />
              )}
              {index % tousLes === 0 && (
                <text x={x + barre / 2} y={hauteur - 6} textAnchor="middle" className="fill-discret text-[10px]">
                  {libelleDePeriode(total.debut, periode, true)}
                </text>
              )}
              {/* Cible plus large que la barre. */}
              <rect
                x={marge.gauche + index * pas}
                y={marge.haut}
                width={pas}
                height={zone.hauteur}
                fill="transparent"
                tabIndex={0}
                aria-label={`${libelleDePeriode(total.debut, periode, false)} : ${libelleDeValeur(valeur, mesure)}`}
                onMouseEnter={() => definirSurvolee(index)}
                onMouseLeave={() => definirSurvolee(null)}
                onFocus={() => definirSurvolee(index)}
                onBlur={() => definirSurvolee(null)}
                className="outline-0"
              />
            </g>
          );
        })}
        <line x1={marge.gauche} x2={largeur - marge.droite} y1={y(0)} y2={y(0)} className="stroke-texte/30" strokeWidth={1} />
      </svg>
      {choisie !== null && survolee !== null && (
        <div
          role="tooltip"
          className="border-bordure bg-fond pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md border px-2 py-1 text-xs shadow-lg"
          style={{ left: `${((marge.gauche + (survolee + 0.5) * pas) / largeur) * 100}%` }}
        >
          <p className="font-medium">{libelleDePeriode(choisie.debut, periode, false)}</p>
          <p>{libelleDeDollars(choisie.coutUsd)} · {libelleDeTokens(choisie.entree + choisie.sortie)} · {choisie.appels} appel{choisie.appels > 1 ? 's' : ''}</p>
        </div>
      )}
    </div>
  );
}

function Onglets<T extends string>({ libelle, choix, valeur, surChoix }: { libelle: string; choix: readonly { cle: T; libelle: string }[]; valeur: T; surChoix: (cle: T) => void }) {
  return (
    <div role="group" aria-label={libelle} className="flex gap-1">
      {choix.map((option) => (
        <button
          key={option.cle}
          type="button"
          aria-pressed={valeur === option.cle}
          onClick={() => surChoix(option.cle)}
          className={`h-7 rounded px-2.5 text-xs outline-0 ${valeur === option.cle ? 'bg-accent/25 text-texte' : 'text-discret hover:bg-texte/10 focus-visible:bg-texte/20'}`}
        >
          {option.libelle}
        </button>
      ))}
    </div>
  );
}

function Chiffre({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <div className="bg-surface rounded-lg px-4 py-3">
      <p className="text-discret text-xs">{libelle}</p>
      <p className="text-2xl font-semibold tabular-nums">{valeur}</p>
    </div>
  );
}

/** Les derniers appels, réel face à estimé : c'est là qu'on voit si l'estimation tient. */
function Appels({ appels }: { appels: AiRun[] }) {
  const derniers = [...appels].reverse().slice(0, 50);
  if (derniers.length === 0) {
    return <p className="text-discret text-sm">Aucun appel pour l’instant.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs tabular-nums">
        <thead className="text-discret">
          <tr>
            <th className="py-1 pr-3 font-medium">Date</th>
            <th className="py-1 pr-3 font-medium">Fonction</th>
            <th className="py-1 pr-3 font-medium">Modèle</th>
            <th className="py-1 pr-3 text-right font-medium">Envoyé</th>
            <th className="py-1 pr-3 text-right font-medium">Reçu</th>
            <th className="py-1 pr-3 text-right font-medium">Coût</th>
            <th className="py-1 text-right font-medium">Estimé</th>
          </tr>
        </thead>
        <tbody>
          {derniers.map((appel) => (
            <tr key={appel.id} className="border-bordure border-t">
              <td className="py-1 pr-3 whitespace-nowrap">{new Date(appel.date).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
              <td className="py-1 pr-3">
                {appel.fonction === 'memo' ? 'Mémo vocal' : libellesDesFonctions[appel.fonction]}
                {appel.annule && <span className="text-discret"> (annulé)</span>}
              </td>
              <td className="py-1 pr-3 font-mono">{appel.modele}</td>
              <td className="py-1 pr-3 text-right whitespace-nowrap">
                {appel.entree} <span className="text-discret">({libelleDEcart(appel.entree, appel.estimation.entree)})</span>
              </td>
              <td className="py-1 pr-3 text-right whitespace-nowrap">
                {appel.sortie} <span className="text-discret">({libelleDEcart(appel.sortie, appel.estimation.sortie)})</span>
              </td>
              <td className="py-1 pr-3 text-right whitespace-nowrap">{appel.coutUsd === null ? 'local' : libelleDeDollars(appel.coutUsd)}</td>
              <td className="py-1 text-right whitespace-nowrap">{appel.estimation.coutUsd === null ? '' : libelleDeDollars(appel.estimation.coutUsd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Historique des fonctions IA (README §12), ouvert depuis les réglages ou la barre de statut. */
export function AiUsageScreen() {
  const [vue, definirVue] = useState<AiUsageView | null>(null);
  const [periode, definirPeriode] = useStoredState<UsagePeriod>('notes.ia.periode', 'jour', estPeriode);
  const [mesure, definirMesure] = useStoredState<Mesure>('notes.ia.mesure', 'cout', estMesure);

  useEffect(() => {
    const lire = (): void => void api.historiqueIa().then(definirVue);
    lire();
    return api.surHistoriqueIa(lire);
  }, []);

  if (vue === null) {
    return null;
  }
  return (
    <div className="mx-auto max-w-3xl space-y-6 py-4">
      <div>
        <h2 className="text-xl font-semibold">Historique des fonctions IA</h2>
        <p className="text-discret mt-1 text-sm">
          Tous les appels, de tous les postes (gardés dans le dossier des notes). Seuls les appels à OpenAI coûtent ; les montants sont en dollars, la monnaie
          de facturation d’OpenAI.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Chiffre libelle="Aujourd’hui" valeur={libelleDeDollars(vue.depenseDuJourUsd)} />
        <Chiffre libelle="Ce mois-ci" valeur={libelleDeDollars(vue.depenseDuMoisUsd)} />
        <Chiffre libelle="Alerte mensuelle" valeur={vue.seuilMensuelUsd === null ? 'aucune' : libelleDeDollars(vue.seuilMensuelUsd)} />
      </div>
      <section className="bg-surface space-y-3 rounded-lg p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Onglets libelle="Mesure" choix={mesures} valeur={mesure} surChoix={definirMesure} />
          <Onglets libelle="Période" choix={periodes} valeur={periode} surChoix={definirPeriode} />
        </div>
        <Barres totaux={vue.totaux[periode]} periode={periode} mesure={mesure} />
      </section>
      <section className="space-y-2">
        <h3 className="font-medium">Derniers appels</h3>
        <Appels appels={vue.appels} />
      </section>
    </div>
  );
}
