import { champsDuTheme, ecrireValeur, lireValeur, themeParDefaut } from '@notes/ui';
import type { FieldKind, Theme } from '@notes/ui';
import { ArrowLeft, FilePlus, LoaderCircle, RotateCcw, SquarePen, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/ipc';
import { inscrireVidage } from '../editor/pending-saves';
import { ThemeField } from './ThemeField';
import { policesInstallees } from './font-detection';
import { InfoTip } from './InfoTip';
import { policesProposees, sectionsDuFormulaire } from './theme-form-model';
import type { FontFamilyKind, FormSection } from './theme-form-model';
import { ThemePreview } from './ThemePreview';
import type { ThemeStatus } from './useTheme';

/** Temps sans réglage avant l'écriture du fichier : on ne l'écrit pas à chaque cran d'un sélecteur de couleur. */
const delaiEnregistrementMs = 400;

const genres = new Map<string, FieldKind>(champsDuTheme.map((champ) => [champ.chemin, champ.genre]));

/** Bouton de l'en-tête : icône et texte centrés, sur une seule ligne. */
const classeDeBouton = 'inline-flex h-8 items-center justify-center gap-2 rounded-md px-3 text-sm leading-none whitespace-nowrap outline-0 disabled:opacity-50';

type Enregistrement = { etat: 'repos' } | { etat: 'attente' } | { etat: 'fait' } | { etat: 'echec'; message: string };

/**
 * Réglages du thème (README §8). Chaque réglage s'applique tout de suite à
 * l'écran, puis est écrit dans `.notes/theme.toml`, qui reste la référence et
 * se modifie aussi à la main.
 */
export function ThemePanel({ theme, surRetour }: { theme: ThemeStatus; surRetour: () => void }) {
  const { fichier, avertissements, appliquer, recharger, occupe } = theme;
  const [enregistrement, definirEnregistrement] = useState<Enregistrement>({ etat: 'repos' });
  const [fichierEnCours, definirFichierEnCours] = useState(false);
  const [echecFichier, definirEchecFichier] = useState<string | null>(null);
  const [confirmation, definirConfirmation] = useState(false);
  // Les polices proposées sont celles qui sont installées : la détection mesure du texte, elle se fait une fois.
  const polices = useMemo(() => ({ texte: policesInstallees(policesProposees.texte), code: policesInstallees(policesProposees.code) }), []);
  const enAttente = useRef<Theme | null>(null);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);

  const existe = fichier?.texte !== null && fichier?.texte !== undefined;
  const sansDossier = fichier === null || fichier.chemin === null;

  /** Écrit tout de suite le thème en attente, s'il y en a un. */
  const vider = useCallback(async (): Promise<void> => {
    if (minuteur.current !== null) {
      clearTimeout(minuteur.current);
      minuteur.current = null;
    }
    const aEcrire = enAttente.current;
    if (aEcrire === null) {
      occupe.current = false;
      return;
    }
    enAttente.current = null;
    try {
      const resultat = await api.enregistrerTheme(aEcrire);
      definirEnregistrement(resultat.ok ? { etat: 'fait' } : { etat: 'echec', message: resultat.message });
    } catch {
      definirEnregistrement({ etat: 'echec', message: "Le thème n'a pas pu être enregistré." });
    }
    // Un autre réglage a pu arriver pendant l'écriture : dans ce cas le fichier est encore en retard sur l'écran.
    occupe.current = enAttente.current !== null;
    await recharger();
  }, [recharger, occupe]);

  // Quitter les réglages ou fermer la fenêtre : ce qui n'est pas écrit l'est tout de suite.
  useEffect(() => {
    const retirer = inscrireVidage(vider);
    return () => {
      retirer();
      void vider();
    };
  }, [vider]);

  const choisir = (nouveau: Theme): void => {
    occupe.current = true;
    appliquer(nouveau);
    enAttente.current = nouveau;
    definirEnregistrement({ etat: 'attente' });
    if (minuteur.current !== null) {
      clearTimeout(minuteur.current);
    }
    minuteur.current = setTimeout(() => void vider(), delaiEnregistrementMs);
  };

  const regler = (chemin: string, valeur: unknown): void => {
    const nouveau = structuredClone(enAttente.current ?? theme.theme);
    ecrireValeur(nouveau, chemin, valeur);
    choisir(nouveau);
  };

  const agirSurLeFichier = async (creer: boolean): Promise<void> => {
    definirFichierEnCours(true);
    definirEchecFichier(null);
    try {
      await vider();
      const cree = creer ? await api.creerTheme() : { ok: true as const };
      if (cree.ok) {
        await recharger();
      }
      const resultat = cree.ok ? await api.ouvrirTheme() : cree;
      definirEchecFichier(resultat.ok ? null : resultat.message);
    } catch {
      definirEchecFichier("L'action n'a pas abouti.");
    } finally {
      definirFichierEnCours(false);
    }
  };

  const courant = enAttente.current ?? theme.theme;
  const proprietesDesChamps = { courant, polices, regler };
  const parDefaut = JSON.stringify(courant) === JSON.stringify(themeParDefaut);

  return (
    <section aria-labelledby="titre-theme" className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-4">
        {/* Reste visible pendant qu'on règle : le retour, le résultat de l'enregistrement et le retour au défaut. */}
        <div className="bg-fond sticky top-0 z-10 -mt-4 space-y-3 pt-4 pb-2">
          <button
            type="button"
            onClick={surRetour}
            className="text-discret hover:bg-texte/10 hover:text-texte focus-visible:bg-texte/20 -ml-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm outline-0"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Retour aux réglages
          </button>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-baseline gap-3">
              <h2 id="titre-theme" className="text-xl font-semibold">
                Thème
              </h2>
              <p role="status" aria-label="Enregistrement du thème" className={`text-sm ${enregistrement.etat === 'echec' ? 'text-erreur' : 'text-discret'}`}>
                {enregistrement.etat === 'attente' && 'Enregistrement…'}
                {enregistrement.etat === 'fait' && 'Thème enregistré'}
                {enregistrement.etat === 'echec' && `Thème non enregistré : ${enregistrement.message}`}
              </p>
            </div>
            {confirmation ? (
              <span className="flex items-center gap-2 text-sm">
                Tout remettre comme au départ ?
                <button
                  type="button"
                  onClick={() => {
                    definirConfirmation(false);
                    choisir(structuredClone(themeParDefaut));
                  }}
                  className={`bg-erreur/20 hover:bg-erreur/35 focus-visible:bg-erreur/45 ${classeDeBouton}`}
                >
                  Oui, rétablir
                </button>
                <button type="button" onClick={() => definirConfirmation(false)} className={`bg-texte/10 hover:bg-texte/20 focus-visible:bg-texte/30 ${classeDeBouton}`}>
                  Annuler
                </button>
              </span>
            ) : (
              <button
                type="button"
                disabled={parDefaut || sansDossier}
                onClick={() => definirConfirmation(true)}
                className={`bg-texte/10 hover:bg-texte/20 focus-visible:bg-texte/30 ${classeDeBouton}`}
              >
                <RotateCcw className="size-4 shrink-0" aria-hidden="true" />
                Rétablir le thème par défaut
              </button>
            )}
          </div>
        </div>
        <p className="text-discret text-sm">
          Chaque réglage s'applique tout de suite et s'enregistre dans un fichier du dossier des notes, qu'on peut aussi modifier à la main.
        </p>

        {avertissements.length > 0 && (
          <div className="bg-alerte/10 rounded-lg p-4 text-sm" role="status" aria-label="Réglages ignorés">
            <p className="flex items-center gap-2 font-medium">
              <TriangleAlert className="text-alerte size-4 shrink-0" aria-hidden="true" />
              {avertissements.length === 1 ? 'Un réglage du fichier a été ignoré' : 'Des réglages du fichier ont été ignorés'}
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              {avertissements.map((avertissement) => (
                <li key={avertissement}>{avertissement}</li>
              ))}
            </ul>
          </div>
        )}

        <fieldset disabled={sansDossier} className="space-y-3">
          {sectionsDuFormulaire
            .filter((section) => section.avance !== true)
            .map((section) => (
              <ThemeSection key={section.titre} section={section} {...proprietesDesChamps} />
            ))}
          <details className="bg-surface rounded-lg">
            <summary className="hover:bg-texte/10 focus-visible:bg-texte/20 cursor-pointer rounded-lg p-4 text-sm font-semibold outline-0">
              Autres réglages : puces, code, interface
            </summary>
            <div className="space-y-3 px-1 pb-1">
              {sectionsDuFormulaire
                .filter((section) => section.avance === true)
                .map((section) => (
                  <ThemeSection key={section.titre} section={section} {...proprietesDesChamps} />
                ))}
            </div>
          </details>
        </fieldset>

        <div className="bg-surface space-y-3 rounded-lg p-4 text-sm">
          <h3 className="font-semibold">Fichier de thème</h3>
          <p role="status">
            {fichier?.erreur != null
              ? fichier.erreur
              : existe
                ? avertissements.length === 0
                  ? 'Le fichier de thème est appliqué.'
                  : 'Le fichier de thème est appliqué, sauf ce qui est listé plus haut.'
                : "Aucun fichier de thème : le thème par défaut s'applique. Il sera créé au premier réglage."}
          </p>
          {fichier?.chemin != null && <p className="text-discret font-mono text-xs break-all">{fichier.chemin}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={fichierEnCours || sansDossier}
              onClick={() => void agirSurLeFichier(!existe)}
              className="bg-accent/20 hover:bg-accent/35 focus-visible:bg-accent/45 inline-flex items-center gap-2 rounded-md px-3 py-1.5 font-medium outline-0 disabled:opacity-50"
            >
              {fichierEnCours ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : existe ? (
                <SquarePen className="size-4" aria-hidden="true" />
              ) : (
                <FilePlus className="size-4" aria-hidden="true" />
              )}
              {existe ? 'Ouvrir le fichier de thème' : 'Créer le fichier de thème'}
            </button>
            {/* Le résultat d'une action s'affiche à côté du bouton qui l'a déclenchée. */}
            {echecFichier !== null && (
              <p role="alert" className="text-erreur">
                {echecFichier}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* L'aperçu : à droite et toujours visible sur une fenêtre large, au-dessus du formulaire sinon. */}
      <aside className="bg-surface order-first rounded-lg p-3 lg:sticky lg:top-0 lg:order-none">
        <ThemePreview />
      </aside>
    </section>
  );
}

interface ThemeSectionProps {
  section: FormSection;
  courant: Theme;
  polices: Record<FontFamilyKind, string[]>;
  regler: (chemin: string, valeur: unknown) => void;
}

/** Une carte du formulaire : son titre, son aide en infobulle, et ses réglages. */
function ThemeSection({ section, courant, polices, regler }: ThemeSectionProps) {
  return (
    <div role="group" aria-label={section.titre} className="bg-surface rounded-lg p-4">
      <h3 className="flex items-center gap-1 text-sm font-semibold">
        {section.titre}
        {section.aide !== undefined && <InfoTip texte={section.aide} sujet={section.titre} />}
      </h3>
      <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-x-4 gap-y-3">
        {section.champs.map((champ) => (
          <ThemeField
            key={champ.chemin}
            libelle={champ.libelle}
            genre={genres.get(champ.chemin) ?? 'police'}
            valeur={lireValeur(courant, champ.chemin)}
            parDefaut={lireValeur(themeParDefaut, champ.chemin)}
            palette={courant.colors}
            {...(champ.aide === undefined ? {} : { aide: champ.aide })}
            {...(champ.police === undefined ? {} : { police: { famille: champ.police, installees: polices[champ.police] } })}
            surChangement={(valeur) => regler(champ.chemin, valeur)}
          />
        ))}
      </div>
    </div>
  );
}
