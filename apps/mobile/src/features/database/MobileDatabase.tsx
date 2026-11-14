import { analyserPage, cheminDuFichierPage, colonneDesPages, couleurDuChoix, lireValeurs, separateurDeLigne, valeurPourLeChamp } from '@notes/core';
import type { BaseConfig, BaseField, TreeNode } from '@notes/core';
import { ajouterLigne, aplatirLignes, changerLigne, changerLignesDuCorps, ligneA, lireLignesDuTableau, lireMarkdown, modifierCorps, remplacerTableauDeBase, tableauDeBase, valeurAffichee } from '@notes/document';
import type { TableRow } from '@notes/document';
import { couleurDuTheme } from '@notes/ui';
import { ArrowDown, ArrowUp, Check, ChevronRight, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Sheet } from '../../components/Sheet';
import { useNotes } from '../../state/NotesContext';

interface MobileDatabaseProps {
  /** Dossier de la page de la base. */
  base: string;
  config: BaseConfig;
  /** Sous-pages de la base, dans l'arborescence : les lignes. */
  enfants: TreeNode[];
  /** Corps de la page de la base : dans une base sans pages, ses lignes sont celles de son tableau. */
  corps: string | null;
  ouvrir: (chemin: string) => void;
  /** « Nouvelle ligne » : la feuille de création d'une sous-page, de la base (null) ou d'une ligne (sous-ligne). */
  creer: (ligne: { chemin: string; titre: string } | null) => void;
}

interface Ligne {
  id: string;
  chemin: string;
  titre: string;
  valeurs: Record<string, string>;
  /** Sous-lignes : les sous-pages de la ligne. */
  enfants: Ligne[];
}

/**
 * Les lignes d'une base sans pages, sous la forme des autres : « chemin » est la place de la ligne dans l'arbre
 * (« 0/2 »), « id » le chemin de ses titres, clé de son repli (comme au PC).
 */
function versLignes(lignes: readonly TableRow[], parent = '', titres = ''): Ligne[] {
  return lignes.map((ligne, rang) => {
    const chemin = parent === '' ? String(rang) : `${parent}/${rang}`;
    const cle = titres === '' ? ligne.titre : `${titres}${separateurDeLigne}${ligne.titre}`;
    return { id: cle, chemin, titre: ligne.titre, valeurs: ligne.valeurs, enfants: versLignes(ligne.enfants, chemin, cle) };
  });
}

/** La même liste, avec une ligne remplacée là où elle se trouve, à tout niveau. */
const remplacerLigne = (lignes: readonly Ligne[], nouvelle: Ligne): Ligne[] =>
  lignes.map((ligne) => (ligne.chemin === nouvelle.chemin ? nouvelle : { ...ligne, enfants: remplacerLigne(ligne.enfants, nouvelle) }));

/** Clic sur l'en-tête : croissant, décroissant, plus de tri (comme au PC). */
function triSuivant(actuel: BaseConfig['tri'], champ: string): BaseConfig['tri'] {
  if (actuel?.champ !== champ) {
    return { champ, sens: 'croissant' };
  }
  return actuel.sens === 'croissant' ? { champ, sens: 'decroissant' } : null;
}

/**
 * Base de données sur le téléphone (docs/spec/base-de-donnees.md) : le tableau des lignes, défilant de côté. Toucher
 * un en-tête trie, toucher une cellule la modifie (feuille du bas). Chaque changement part sur le NAS, sous le
 * verrou de la ligne, puis le tableau écrit dans la page de la base est refait.
 */
export function MobileDatabase({ base, config, enfants, corps, ouvrir, creer }: MobileDatabaseProps) {
  const { env, theme, modifiable, modifierPage, montrerAvis, versionDuCache } = useNotes();
  const [lignesDesPages, definirLignes] = useState<Ligne[]>([]);
  const sansPages = config.lignes === 'tableau';
  // Base sans pages : les lignes sont lues dans le tableau du corps de la page.
  const lignesDuTableau = useMemo(() => (sansPages && corps !== null ? versLignes(lireLignesDuTableau(lireMarkdown(corps).document, config.champs)) : []), [sansPages, corps, config]);
  const lignes = sansPages ? lignesDuTableau : lignesDesPages;
  // Feuille d'une base sans pages : nouvelle ligne (sous « parent », ou à la fin), ou titre d'une ligne (renommer, retirer).
  const [feuilleDeLigne, definirFeuilleDeLigne] = useState<{ genre: 'nouvelle'; parent: Ligne | null; titre: string } | { genre: 'titre'; ligne: Ligne; titre: string } | null>(null);
  const [edition, definirEdition] = useState<{ ligne: Ligne; champ: BaseField; texte: string } | null>(null);
  const [message, definirMessage] = useState<string | null>(null);
  // Lignes dont les sous-lignes sont repliées, par identifiant, gardées dans l'en-tête de la base (comme au PC). Le choix
  // du moment s'affiche avant de revenir du NAS ; sans NAS, il reste sur l'écran seulement.
  const [replieesLocales, definirReplieesLocales] = useState<ReadonlySet<string> | null>(null);
  useEffect(() => definirReplieesLocales(null), [config]);
  const repliees = useMemo(() => replieesLocales ?? new Set(config.repliees ?? []), [replieesLocales, config]);
  const etats = theme.database.states;

  // Les valeurs viennent de l'en-tête de chaque sous-page, dans le cache du téléphone ; leurs sous-pages sont les sous-lignes.
  useEffect(() => {
    let annule = false;
    const lire = (noeuds: TreeNode[]): Promise<Ligne[]> =>
      Promise.all(
        noeuds
          .filter((enfant) => enfant.importe && enfant.id !== null)
          .map(async (enfant) => {
            const texte = await env.local.lireTexte(cheminDuFichierPage(enfant.chemin)).catch(() => '');
            return { id: enfant.id!, chemin: enfant.chemin, titre: enfant.titre, valeurs: lireValeurs(analyserPage(texte).enTete), enfants: await lire(enfant.enfants) };
          }),
      );
    void lire(enfants).then((lues) => !annule && definirLignes(lues));
    return () => {
      annule = true;
    };
  }, [env, enfants, versionDuCache]);

  const aPlat = useMemo(() => aplatirLignes(lignes, config.champs, config.tri, etats.map((etat) => etat.name)), [lignes, config, etats]);
  // Ce qui s'affiche : les sous-lignes d'une ligne repliée sont cachées.
  const visibles = useMemo(() => {
    let cachePlusProfondQue: number | null = null;
    return aPlat.filter(({ ligne, profondeur }) => {
      if (cachePlusProfondQue !== null && profondeur > cachePlusProfondQue) {
        return false;
      }
      cachePlusProfondQue = repliees.has(ligne.id) ? profondeur : null;
      return true;
    });
  }, [aPlat, repliees]);

  const basculerRepli = (id: string): void => {
    const existantes = new Set(aPlat.map(({ ligne }) => ligne.id));
    const apres = new Set([...repliees].filter((autre) => existantes.has(autre)));
    if (!apres.delete(id)) {
      apres.add(id);
    }
    definirReplieesLocales(apres);
    if (modifiable) {
      void modifierPage(base, { corpsAttendu: null, operation: () => null, meta: { base: { ...config, repliees: [...apres] } } });
    }
  };

  /** Le tableau écrit dans la page de la base, refait après un changement. */
  const refaireLeTableau = useCallback(
    (nouvelles: Ligne[], nouvelleConfig: BaseConfig) => {
      const lignesEcrites = aplatirLignes(nouvelles, nouvelleConfig.champs, nouvelleConfig.tri, etats.map((etat) => etat.name)).map(({ ligne, profondeur }) => ({ ...ligne, profondeur }));
      const markdown = tableauDeBase(nouvelleConfig.champs, lignesEcrites);
      return modifierPage(base, { corpsAttendu: null, operation: (corps) => modifierCorps(corps, (tr) => remplacerTableauDeBase(tr, markdown), false) });
    },
    [base, etats, modifierPage],
  );

  const refuserHorsLigne = (): boolean => {
    if (!modifiable) {
      montrerAvis('Le NAS ne répond pas : la base est en lecture seule.');
      return true;
    }
    return false;
  };

  /**
   * Base sans pages : change les lignes du tableau sur le NAS, sous le verrou de la page de la base, à partir de
   * celles qu'il a à ce moment. La ligne visée est retrouvée par sa place et son titre ; si elle a bougé entre-temps,
   * rien n'est écrit et l'écran reprend la version du NAS.
   */
  const changerLignes = (ligne: Ligne | null, changer: (lignesDuNas: TableRow[]) => TableRow[]): Promise<boolean> =>
    modifierPage(base, {
      corpsAttendu: null,
      operation: (corpsDuNas) =>
        changerLignesDuCorps(corpsDuNas, config.champs, (lignesDuNas) => (ligne === null || ligneA(lignesDuNas, ligne.chemin)?.titre === ligne.titre ? changer(lignesDuNas) : null)),
    });

  const changerValeur = async (ligne: Ligne, champ: BaseField, saisie: string): Promise<void> => {
    const resultat = valeurPourLeChamp(champ.type, saisie);
    if (!resultat.ok) {
      definirMessage(resultat.message);
      return;
    }
    definirEdition(null);
    definirMessage(null);
    if (sansPages) {
      await changerLignes(ligne, (lignesDuNas) =>
        changerLigne(lignesDuNas, ligne.chemin, (actuelle) => {
          const { [champ.nom]: _ancienne, ...autres } = actuelle.valeurs;
          return { ...actuelle, valeurs: resultat.valeur === null ? autres : { ...actuelle.valeurs, [champ.nom]: resultat.valeur } };
        }),
      );
      return;
    }
    const valeurs = { ...ligne.valeurs };
    if (resultat.valeur === null) {
      delete valeurs[champ.nom];
    } else {
      valeurs[champ.nom] = resultat.valeur;
    }
    const nouvelles = remplacerLigne(lignes, { ...ligne, valeurs });
    // Affichée tout de suite ; si le NAS refuse, l'arborescence relue remet la valeur d'avant.
    definirLignes(nouvelles);
    if (await modifierPage(ligne.chemin, { corpsAttendu: null, operation: () => null, valeurDeBase: { champ: champ.nom, valeur: resultat.valeur } })) {
      await refaireLeTableau(nouvelles, config);
    } else {
      definirLignes(lignes);
    }
  };

  const trier = async (champ: string): Promise<void> => {
    if (refuserHorsLigne()) {
      return;
    }
    const nouvelle = { ...config, tri: triSuivant(config.tri, champ) };
    // Sans pages, le tableau garde l'ordre des lignes : le tri ne change que l'affichage.
    if ((await modifierPage(base, { corpsAttendu: null, operation: () => null, meta: { base: nouvelle } })) && !sansPages) {
      await refaireLeTableau(lignes, nouvelle);
    }
  };

  const toucher = (ligne: Ligne, champ: BaseField): void => {
    if (refuserHorsLigne()) {
      return;
    }
    if (champ.type === 'case') {
      void changerValeur(ligne, champ, String(ligne.valeurs[champ.nom] !== 'true'));
    } else {
      definirMessage(null);
      definirEdition({ ligne, champ, texte: ligne.valeurs[champ.nom] ?? '' });
    }
  };

  const enTete = (nom: string) => (
    <th key={nom} scope="col" className="border border-bordure bg-surface p-0 text-left font-semibold" style={config.largeurs[nom] === undefined ? undefined : { minWidth: `${config.largeurs[nom]}px` }}>
      <button type="button" onClick={() => void trier(nom)} className="flex w-full items-center gap-1 px-2 py-2 outline-none active:bg-texte/10">
        <span className="whitespace-nowrap">{nom}</span>
        {config.tri?.champ === nom && (config.tri.sens === 'croissant' ? <ArrowUp className="size-3.5 text-accent" /> : <ArrowDown className="size-3.5 text-accent" />)}
      </button>
    </th>
  );

  /** Une valeur en pastille : un état prend la couleur du thème, un choix celle de sa liste. */
  const pastille = (etat: string, champ?: BaseField) => {
    const couleur = couleurDuTheme(champ?.type === 'choix' ? (couleurDuChoix(champ, etat) ?? 'muted') : (etats.find((candidat) => candidat.name === etat)?.color ?? 'muted'));
    return (
      <span className="rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap" style={{ backgroundColor: `color-mix(in srgb, ${couleur} 25%, transparent)`, color: couleur }}>
        {etat}
      </span>
    );
  };

  return (
    <section aria-label="Base de données" className="mb-4 text-sm">
      <div className="-mx-5 overflow-x-auto px-5">
        <table className="border-collapse">
          <thead>
            <tr>
              {enTete(colonneDesPages)}
              {config.champs.map((champ) => enTete(champ.nom))}
            </tr>
          </thead>
          <tbody>
            {visibles.map(({ ligne, profondeur }) => (
              <tr key={ligne.id}>
                <td className="border border-bordure p-0">
                  <div className="flex items-center" style={{ paddingLeft: `${profondeur * 1.1}rem` }}>
                    {ligne.enfants.length > 0 ? (
                      <button
                        type="button"
                        aria-label={`${repliees.has(ligne.id) ? 'Déplier' : 'Replier'} les sous-lignes de ${ligne.titre}`}
                        aria-expanded={!repliees.has(ligne.id)}
                        onClick={() => basculerRepli(ligne.id)}
                        className="flex size-9 shrink-0 items-center justify-center text-discret outline-none active:bg-texte/10"
                      >
                        <ChevronRight className={`size-4 transition-transform ${repliees.has(ligne.id) ? '' : 'rotate-90'}`} />
                      </button>
                    ) : (
                      <span className="w-2 shrink-0" />
                    )}
                    <button
                      type="button"
                      onClick={() => (sansPages ? !refuserHorsLigne() && definirFeuilleDeLigne({ genre: 'titre', ligne, titre: ligne.titre }) : ouvrir(ligne.chemin))}
                      className={`block min-w-0 flex-1 max-w-56 break-words py-2 pr-1 text-left outline-none active:bg-texte/10 ${profondeur === 0 ? 'font-medium' : ''}`}
                    >
                      {profondeur > 0 && <span className="text-discret">↳ </span>}
                      {ligne.titre}
                    </button>
                    <button
                      type="button"
                      aria-label={`Ajouter une sous-ligne à ${ligne.titre}`}
                      onClick={() => !refuserHorsLigne() && (sansPages ? definirFeuilleDeLigne({ genre: 'nouvelle', parent: ligne, titre: '' }) : creer({ chemin: ligne.chemin, titre: ligne.titre }))}
                      className="flex size-9 shrink-0 items-center justify-center text-discret outline-none active:bg-texte/10"
                    >
                      <Plus className="size-4" />
                    </button>
                  </div>
                </td>
                {config.champs.map((champ) => {
                  const valeur = ligne.valeurs[champ.nom] ?? '';
                  return (
                    <td key={champ.nom} className="border border-bordure p-0">
                      <button
                        type="button"
                        aria-label={`${champ.nom} de ${ligne.titre}`}
                        onClick={() => toucher(ligne, champ)}
                        className={`flex min-h-9 w-full min-w-16 items-center px-2 py-1 text-left outline-none active:bg-texte/10 ${champ.type === 'nombre' ? 'justify-end tabular-nums' : ''}`}
                      >
                        {(champ.type === 'etat' || champ.type === 'choix') && valeur !== '' ? (
                          pastille(valeur, champ)
                        ) : champ.type === 'case' ? (
                          <span className={`flex size-5 items-center justify-center rounded-[5px] ${valeur === 'true' ? 'bg-accent text-fond' : 'bg-texte/15'}`}>{valeur === 'true' && <Check className="size-4" strokeWidth={3} />}</span>
                        ) : (
                          <span className="whitespace-nowrap">{valeurAffichee(champ.type, valeur)}</span>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={() => !refuserHorsLigne() && (sansPages ? definirFeuilleDeLigne({ genre: 'nouvelle', parent: null, titre: '' }) : creer(null))}
        className="mt-2 flex items-center gap-1.5 rounded-lg px-2 py-2 text-discret outline-none active:bg-texte/10"
      >
        <Plus className="size-4" />
        Nouvelle ligne
      </button>
      {edition !== null && (
        <Sheet titre={`${edition.champ.nom} de « ${edition.ligne.titre} »`} fermer={() => definirEdition(null)}>
          {edition.champ.type === 'etat' || edition.champ.type === 'choix' ? (
            // Le téléphone choisit dans la liste ; les valeurs possibles d'un choix se règlent sur le PC.
            <div className="flex flex-col px-2">
              {[...(edition.champ.type === 'choix' ? (edition.champ.choix ?? []).map((choix) => choix.nom) : etats.map((etat) => etat.name)), ''].map((etat) => (
                <button
                  key={etat === '' ? 'aucun' : etat}
                  type="button"
                  onClick={() => void changerValeur(edition.ligne, edition.champ, etat)}
                  className="flex items-center gap-3 rounded-lg px-3 py-3 text-left outline-none active:bg-texte/10"
                >
                  {etat === '' ? <span className="text-discret">Aucun</span> : pastille(etat, edition.champ)}
                  {(edition.ligne.valeurs[edition.champ.nom] ?? '') === etat && <Check className="ml-auto size-4 text-accent" />}
                </button>
              ))}
            </div>
          ) : (
            <form
              className="flex flex-col gap-3 px-4"
              onSubmit={(evenement) => {
                evenement.preventDefault();
                void changerValeur(edition.ligne, edition.champ, edition.texte);
              }}
            >
              <input
                autoFocus
                aria-label={edition.champ.nom}
                type={edition.champ.type === 'courriel' ? 'email' : 'text'}
                inputMode={edition.champ.type === 'nombre' ? 'decimal' : edition.champ.type === 'courriel' ? 'email' : 'text'}
                enterKeyHint="done"
                value={edition.texte}
                onChange={(evenement) => definirEdition({ ...edition, texte: evenement.target.value })}
                className="rounded-lg bg-fond px-3 py-2.5 outline-none"
              />
              {message !== null && <p className="text-sm text-erreur">{message}</p>}
              <button type="submit" className="self-end rounded-lg bg-accent/25 px-4 py-2.5 font-medium outline-none active:bg-accent/40">
                Valider
              </button>
            </form>
          )}
        </Sheet>
      )}
      {sansPages && enfants.some((enfant) => enfant.importe && enfant.id !== null) && (
        <div className="mt-2">
          <p className="px-2 text-xs text-discret">Pages de la base (leur texte ne tient pas dans une ligne) :</p>
          {enfants
            .filter((enfant) => enfant.importe && enfant.id !== null)
            .map((enfant) => (
              <button key={enfant.chemin} type="button" onClick={() => ouvrir(enfant.chemin)} className="block w-full rounded-lg px-2 py-2 text-left outline-none active:bg-texte/10">
                {enfant.titre}
              </button>
            ))}
        </div>
      )}
      {feuilleDeLigne !== null && (
        <Sheet
          titre={feuilleDeLigne.genre === 'titre' ? `Ligne « ${feuilleDeLigne.ligne.titre} »` : feuilleDeLigne.parent === null ? 'Nouvelle ligne' : `Sous-ligne de « ${feuilleDeLigne.parent.titre} »`}
          fermer={() => definirFeuilleDeLigne(null)}
        >
          <form
            className="flex flex-col gap-3 px-4"
            onSubmit={(evenement) => {
              evenement.preventDefault();
              const feuille = feuilleDeLigne;
              const titre = feuille.titre.trim();
              definirFeuilleDeLigne(null);
              if (titre === '') {
                return;
              }
              if (feuille.genre === 'nouvelle') {
                void changerLignes(feuille.parent, (lignesDuNas) => ajouterLigne(lignesDuNas, feuille.parent?.chemin ?? null, titre));
              } else if (titre !== feuille.ligne.titre) {
                void changerLignes(feuille.ligne, (lignesDuNas) => changerLigne(lignesDuNas, feuille.ligne.chemin, (actuelle) => ({ ...actuelle, titre })));
              }
            }}
          >
            <input
              autoFocus
              aria-label="Titre de la ligne"
              enterKeyHint="done"
              value={feuilleDeLigne.titre}
              onChange={(evenement) => definirFeuilleDeLigne({ ...feuilleDeLigne, titre: evenement.target.value })}
              className="rounded-lg bg-fond px-3 py-2.5 outline-none"
            />
            <div className="flex justify-end gap-2">
              {feuilleDeLigne.genre === 'titre' && (
                <button
                  type="button"
                  onClick={() => {
                    const { ligne } = feuilleDeLigne;
                    definirFeuilleDeLigne(null);
                    void changerLignes(ligne, (lignesDuNas) => changerLigne(lignesDuNas, ligne.chemin, () => null));
                  }}
                  className="rounded-lg px-4 py-2.5 text-erreur outline-none active:bg-erreur/15"
                >
                  Retirer la ligne
                </button>
              )}
              <button type="submit" className="rounded-lg bg-accent/25 px-4 py-2.5 font-medium outline-none active:bg-accent/40">
                {feuilleDeLigne.genre === 'titre' ? 'Renommer' : 'Ajouter'}
              </button>
            </div>
          </form>
        </Sheet>
      )}
      {message !== null && edition === null && <p className="mt-2 text-sm text-erreur">{message}</p>}
    </section>
  );
}
