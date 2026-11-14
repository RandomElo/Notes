import type { Base, BaseConfig, BaseField, BaseRow } from '@notes/core';
import { colonneDesPages, nomDeChampValide, nomDeChoixValide, separateurDeLigne, valeurPourLeChamp } from '@notes/core';
import { ajouterLigne, aplatirLignes, changerLigne, changerToutesLesValeurs, corpsDuTexte, lireLignesDuTableau, tableauDeBase, tableauDesLignes, valeurAffichee } from '@notes/document';
import type { TableRow } from '@notes/document';
import type { DatabaseState } from '@notes/ui';
import type { Editor } from '@tiptap/react';
import { ArrowDown, ArrowUp, Check, ChevronRight, EllipsisVertical, FileText, List, Pencil, Plus, Shapes, Trash2, Undo2 } from 'lucide-react';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react';
import { api } from '../../lib/ipc';
import { PageIcon } from '../page-icon/PageIcon';
import { ContextMenu } from '../sidebar/ContextMenu';
import { BaseSettingsDialog } from './BaseSettingsDialog';
import type { ConversionPreview } from './BaseSettingsDialog';
import { ChoiceEditor } from './ChoiceEditor';
import { ChoicePicker, ChoicePill } from './ChoicePicker';
import { analyserVersTableau, avecDescription, champDeDescription, compterLignes, nomDeDescription } from './database-conversion';
import {
  avecChamp,
  avecChampDeplace,
  avecChampRenomme,
  avecChoix,
  avecChoixDeplace,
  avecCouleurDeChoix,
  avecLargeur,
  avecNouveauChoix,
  avecType,
  couleurDEtat,
  largeurParDefaut,
  sansChamp,
  triSuivant,
  typesDeChamp,
  champDeLaCase,
  ligneCochee,
  valeurDeLaCase,
} from './database-model';
import { mettreAJourLeTableau } from './database-extension';

interface DatabaseViewProps {
  /** Dossier de la page de la base. */
  chemin: string;
  /** Change quand les sous-pages changent (ajout, renommage, déplacement) : la base se relit. */
  signatureDesLignes: string;
  /** États proposés par un champ « état », pris dans le thème. */
  etats: readonly DatabaseState[];
  lectureSeule: boolean;
  /** L'éditeur de la page : le tableau écrit dans la page y est tenu à jour. */
  editeur: Editor | null;
  surOuvrirPage: (id: string, nouvelOnglet: boolean) => void;
  /** Une ligne a été créée : l'arborescence se relit. */
  surArbreModifie: () => void;
  /** Met la sous-page d'une ligne à la corbeille (elle s'y restaure 30 jours). */
  surCorbeille: (chemin: string) => Promise<boolean>;
  /** La fenêtre « Paramètres de la base » est ouverte (depuis le menu « ⋮ » de la page). */
  parametresOuverts: boolean;
  surFermerParametres: () => void;
}

type Edition = { ligne: string; champ: string; texte: string };
type Menu = { x: number; y: number; genre: 'etat'; ligne: BaseRow; champ: string } | { x: number; y: number; genre: 'champ'; champ: BaseField };
/** Panneau ouvert : la liste d'une cellule « choix », ou les valeurs possibles d'un champ « choix » (relues dans la configuration). */
type Panneau = { x: number; y: number; genre: 'choix'; ligne: BaseRow; champ: string } | { x: number; y: number; genre: 'valeurs'; champ: string };
/** Ligne en cours de création : sous la base (parent null) ou sous une ligne (sous-ligne). */
type NouvelleLigne = { parent: string | null; titre: string };

/**
 * Les lignes d'une base sans pages, sous la forme des lignes d'une base à pages : « chemin » est la place de la
 * ligne dans l'arbre (« 0/2 »), « id » le chemin de ses titres, qui sert de clé à son repli.
 */
function versLignesDeBase(lignes: readonly TableRow[], parent = '', titres = ''): BaseRow[] {
  return lignes.map((ligne, rang) => {
    const chemin = parent === '' ? String(rang) : `${parent}/${rang}`;
    const cle = titres === '' ? ligne.titre : `${titres}${separateurDeLigne}${ligne.titre}`;
    return {
      id: cle,
      chemin,
      titre: ligne.titre,
      icone: null,
      valeurs: ligne.valeurs,
      enfants: versLignesDeBase(ligne.enfants, chemin, cle),
    };
  });
}

const cellule = 'border-(--tableau-bordure) border px-2 py-1 align-top';
// Cellules du corps : le contenu trop large est rogné (une colonne étroite ne déborde pas) ; le titre d'une ligne revient à la ligne.
const celluleCorps = `${cellule} overflow-hidden`;
const boutonDeLigne =
  'text-discret hover:bg-texte/10 hover:text-texte focus-visible:bg-texte/20 flex size-6 shrink-0 items-center justify-center rounded opacity-0 outline-0 group-hover/ligne:opacity-100 focus-visible:opacity-100';

/**
 * Vue d'une base de données (docs/spec/base-de-donnees.md), au-dessus du texte de sa page : une ligne par
 * sous-page, ses sous-pages en sous-lignes repliables, une colonne par champ. Un clic sur l'en-tête trie, un
 * clic dans une cellule la modifie (l'état dans sa liste, la case d'un clic). Chaque changement s'écrit dans
 * l'en-tête de la sous-page, puis le tableau écrit dans la page est refait.
 */
export function DatabaseView({ chemin, signatureDesLignes, etats, lectureSeule, editeur, surOuvrirPage, surArbreModifie, surCorbeille, parametresOuverts, surFermerParametres }: DatabaseViewProps) {
  const [base, definirBase] = useState<Base | null>(null);
  const [erreur, definirErreur] = useState<string | null>(null);
  const [edition, definirEdition] = useState<Edition | null>(null);
  const [menu, definirMenu] = useState<Menu | null>(null);
  const [panneau, definirPanneau] = useState<Panneau | null>(null);
  const [renommage, definirRenommage] = useState<{
    ancien: string;
    texte: string;
  } | null>(null);
  const [nouveauChamp, definirNouveauChamp] = useState<{
    nom: string;
    type: BaseField['type'];
  } | null>(null);
  const [nouvelleLigne, definirNouvelleLigne] = useState<NouvelleLigne | null>(null);
  // Largeur d'une colonne pendant qu'on tire son bord : montrée tout de suite, écrite au lâcher.
  const [largeurEnCours, definirLargeurEnCours] = useState<{
    colonne: string;
    depart: number;
    largeurDeDepart: number;
    largeur: number;
  } | null>(null);

  const recharger = useCallback(async (): Promise<void> => {
    const lue = await api.lireBase({ chemin });
    if (lue.ok) {
      definirBase({ config: lue.config, lignes: lue.lignes });
    } else {
      definirErreur(lue.erreur.message);
    }
  }, [chemin]);

  useEffect(() => {
    void recharger();
  }, [recharger, signatureDesLignes]);

  // Une valeur changée sur le téléphone arrive par la sync : la base se relit quand on revient à la fenêtre.
  useEffect(() => {
    const auRetour = (): void => void recharger();
    window.addEventListener('focus', auRetour);
    return () => window.removeEventListener('focus', auRetour);
  }, [recharger]);

  // Base sans pages : les lignes sont celles du tableau de la page, relues dans l'éditeur à chaque changement du document.
  const sansPages = base?.config.lignes === 'tableau';
  const [versionDuDocument, definirVersionDuDocument] = useState(0);
  useEffect(() => {
    if (!sansPages || editeur === null || editeur.isDestroyed) {
      return;
    }
    const suivre = (): void => definirVersionDuDocument((version) => version + 1);
    editeur.on('update', suivre);
    return () => {
      editeur.off('update', suivre);
    };
  }, [sansPages, editeur]);
  const lignesDuTableau = useMemo(
    () => (!sansPages || base === null || editeur === null || editeur.isDestroyed ? [] : lireLignesDuTableau(editeur.state.doc, base.config.champs)),
    // La version du document dit quand le relire.
    [sansPages, base, editeur, versionDuDocument],
  );
  const lignes = useMemo(() => (base === null ? [] : sansPages ? versLignesDeBase(lignesDuTableau) : base.lignes), [base, sansPages, lignesDuTableau]);

  // Lignes dont les sous-lignes sont repliées, par identifiant, gardées dans l'en-tête de la base. Dépliées sinon.
  const repliees = useMemo(() => new Set(base?.config.repliees ?? []), [base]);
  const nomsDEtats = useMemo(() => etats.map((etat) => etat.name), [etats]);
  // Lignes et sous-lignes à plat, chaque niveau trié à part, une sous-ligne juste sous sa ligne.
  const aPlat = useMemo(() => (base === null ? [] : aplatirLignes(lignes, base.config.champs, base.config.vue === 'liste' ? null : base.config.tri, nomsDEtats)), [base, lignes, nomsDEtats]);
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

  // Le tableau écrit dans la page suit la base : c'est lui qu'on lit hors de l'application.
  useEffect(() => {
    if (base !== null && !sansPages && editeur !== null && !editeur.isDestroyed && !lectureSeule) {
      mettreAJourLeTableau(
        editeur.view,
        tableauDeBase(
          base.config.champs,
          aPlat.map(({ ligne, profondeur }) => ({ ...ligne, profondeur })),
        ),
      );
    }
  }, [base, sansPages, aPlat, editeur, lectureSeule]);
  // Sans pages, le tableau est la source : il ne se refait que quand les champs changent (colonne ajoutée, retirée,
  // type changé), relu juste avant. Un renommage réécrit le tableau lui-même avant la configuration.
  const signatureDesChamps = JSON.stringify(base?.config.champs ?? []);
  useEffect(() => {
    if (base !== null && sansPages && editeur !== null && !editeur.isDestroyed && !lectureSeule) {
      mettreAJourLeTableau(editeur.view, tableauDesLignes(base.config.champs, lireLignesDuTableau(editeur.state.doc, base.config.champs)));
    }
    // Seuls les champs comptent ici.
  }, [signatureDesChamps, sansPages, editeur, lectureSeule]);

  /** Base sans pages : réécrit le tableau de la page avec ces lignes (et ces champs, pour un renommage). La page s'enregistre comme après une frappe. */
  const ecrireLignes = (nouvelles: readonly TableRow[], champs?: BaseField[]): void => {
    if (base !== null && editeur !== null && !editeur.isDestroyed) {
      definirRetrait(null);
      mettreAJourLeTableau(editeur.view, tableauDesLignes(champs ?? base.config.champs, nouvelles));
    }
  };

  // Base sans pages : une ligne retirée n'a pas de corbeille. Jusqu'au changement suivant, « Annuler » (ou Ctrl+Z
  // hors d'un champ de saisie) remet les lignes d'avant.
  const [retrait, definirRetrait] = useState<{
    titre: string;
    avant: readonly TableRow[];
  } | null>(null);
  const retirerLigne = (ligne: BaseRow): void => {
    const avant = lignesDuTableau;
    ecrireLignes(changerLigne(avant, ligne.chemin, () => null));
    definirRetrait({ titre: ligne.titre, avant });
  };
  const annulerRetrait = useRef<() => void>(() => undefined);
  annulerRetrait.current = () => {
    if (retrait !== null) {
      ecrireLignes(retrait.avant);
    }
  };
  useEffect(() => {
    if (retrait === null) {
      return;
    }
    const surTouche = (evenement: globalThis.KeyboardEvent): void => {
      const cible = evenement.target as HTMLElement | null;
      const enSaisie = cible !== null && (cible.isContentEditable || cible.tagName === 'INPUT' || cible.tagName === 'TEXTAREA');
      if ((evenement.ctrlKey || evenement.metaKey) && !evenement.shiftKey && evenement.key.toLowerCase() === 'z' && !enSaisie) {
        evenement.preventDefault();
        annulerRetrait.current();
      }
    };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [retrait]);

  /** Lance une écriture, montre son refus, puis relit la base. */
  const ecrire = async (tache: () => Promise<{ ok: true } | { ok: false; erreur: { message: string } }>): Promise<boolean> => {
    const resultat = await tache();
    definirErreur(resultat.ok ? null : resultat.erreur.message);
    await recharger();
    return resultat.ok;
  };
  const changerConfig = (config: BaseConfig): Promise<boolean> => ecrire(() => api.changerConfigDeBase({ chemin, config }));
  const refuser = (message: string): Promise<boolean> => {
    definirErreur(message);
    return Promise.resolve(false);
  };

  /** Change une valeur : dans l'en-tête de la sous-page, ou, sans pages, dans le tableau (un choix nouveau s'ajoute à la liste du champ). */
  const changerValeur = async (ligne: BaseRow, champ: string, valeur: string): Promise<boolean> => {
    if (!sansPages || base === null) {
      return ecrire(() =>
        api.changerValeurDeBase({
          base: chemin,
          ligne: ligne.chemin,
          champ,
          valeur,
        }),
      );
    }
    const definition = base.config.champs.find((candidat) => candidat.nom === champ);
    const resultat = definition === undefined ? null : valeurPourLeChamp(definition.type, valeur);
    if (resultat === null || !resultat.ok) {
      return refuser(resultat?.message ?? `Le champ « ${champ} » n'existe plus.`);
    }
    definirErreur(null);
    ecrireLignes(
      changerLigne(lignesDuTableau, ligne.chemin, (actuelle) => {
        const { [champ]: _ancienne, ...autres } = actuelle.valeurs;
        return {
          ...actuelle,
          valeurs: resultat.valeur === null ? autres : { ...actuelle.valeurs, [champ]: resultat.valeur },
        };
      }),
    );
    if (definition?.type === 'choix' && resultat.valeur !== null && !(definition.choix ?? []).some((choix) => choix.nom === resultat.valeur)) {
      return changerConfig(avecNouveauChoix(base.config, champ, resultat.valeur));
    }
    return true;
  };

  /** Renomme un champ : dans les sous-pages, ou, sans pages, dans le tableau d'abord, puis dans la configuration. */
  const renommerChamp = async (ancien: string, nouveau: string): Promise<boolean> => {
    if (!sansPages || base === null) {
      return ecrire(() => api.renommerChampDeBase({ chemin, ancien, nouveau }));
    }
    const nom = nouveau.trim();
    if (nom === ancien) {
      return true;
    }
    if (!nomDeChampValide(nom) || base.config.champs.some((champ) => champ.nom === nom)) {
      return refuser(`« ${nom} » n'est pas un nom de champ possible (vide, trop long, « ${colonneDesPages} », avec | ou déjà pris).`);
    }
    const config = avecChampRenomme(base.config, ancien, nom);
    ecrireLignes(
      changerToutesLesValeurs(lignesDuTableau, (valeurs) => {
        const { [ancien]: valeur, ...autres } = valeurs;
        return valeur === undefined ? valeurs : { ...autres, [nom]: valeur };
      }),
      config.champs,
    );
    return changerConfig(config);
  };

  /** Renomme un choix d'un champ, partout : sous-pages, ou lignes du tableau. */
  const renommerChoix = async (champ: string, ancien: string, nouveau: string): Promise<boolean> => {
    if (!sansPages || base === null) {
      return ecrire(() => api.renommerChoixDeBase({ chemin, champ, ancien, nouveau }));
    }
    const nom = nouveau.trim();
    const definition = base.config.champs.find((candidat) => candidat.nom === champ);
    if (nom === ancien || definition === undefined) {
      return true;
    }
    if (!nomDeChoixValide(nom) || (definition.choix ?? []).some((choix) => choix.nom === nom)) {
      return refuser(`« ${nom} » n'est pas un choix possible (vide, trop long, avec | ou déjà dans la liste).`);
    }
    ecrireLignes(changerToutesLesValeurs(lignesDuTableau, (valeurs) => (valeurs[champ] === ancien ? { ...valeurs, [champ]: nom } : valeurs)));
    return changerConfig(avecChoix(base.config, champ, (liste) => liste.map((choix) => (choix.nom === ancien ? { ...choix, nom } : choix))));
  };

  /** Retire un choix d'un champ : de la liste, et des lignes qui l'avaient. */
  const retirerChoix = async (champ: string, nom: string): Promise<boolean> => {
    if (!sansPages || base === null) {
      return ecrire(() => api.retirerChoixDeBase({ chemin, champ, nom }));
    }
    ecrireLignes(
      changerToutesLesValeurs(lignesDuTableau, (valeurs) => {
        const { [champ]: valeur, ...autres } = valeurs;
        return valeur === nom ? autres : valeurs;
      }),
    );
    return changerConfig(avecChoix(base.config, champ, (liste) => liste.filter((choix) => choix.nom !== nom)));
  };

  /** Ce que donnerait le passage à l'autre mode (fenêtre des paramètres). */
  const analyserConversion = async (): Promise<ConversionPreview | string> => {
    if (base === null) {
      return 'La base n’est pas lue.';
    }
    if (sansPages) {
      return { versTableau: false, lignes: compterLignes(lignesDuTableau) };
    }
    const resultat = await analyserVersTableau(base.lignes, champDeDescription(base.config), async (cheminDeLaLigne) => {
      const lu = await api.lirePage({ chemin: cheminDeLaLigne });
      return lu.ok ? lu.corps : null;
    });
    return {
      versTableau: true,
      lignes: compterLignes(resultat.converties.map(({ ligne }) => ligne)),
      restent: resultat.restent,
    };
  };

  /**
   * Passe la base dans l'autre mode. Vers « sans pages » : le tableau est écrit, puis la configuration, puis les
   * sous-pages converties vont à la corbeille. Vers « une page par ligne » : chaque ligne devient une sous-page avec
   * ses valeurs et sa Description pour texte, puis la configuration change. Rend le message d'erreur, ou null.
   */
  const convertir = async (): Promise<string | null> => {
    if (base === null || editeur === null || editeur.isDestroyed) {
      return 'La page n’est pas prête.';
    }
    const { config } = base;
    if (!sansPages) {
      const description = champDeDescription(config);
      const resultat = await analyserVersTableau(base.lignes, description, async (cheminDeLaLigne) => {
        const lu = await api.lirePage({ chemin: cheminDeLaLigne });
        return lu.ok ? lu.corps : null;
      });
      const nouvelle: BaseConfig = {
        ...avecDescription(config, description),
        repliees: [],
        lignes: 'tableau',
      };
      ecrireLignes(
        resultat.converties.map(({ ligne }) => ligne),
        nouvelle.champs,
      );
      if (!(await changerConfig(nouvelle))) {
        return 'La base n’a pas pu passer sans pages.';
      }
      for (const { chemin: cheminDeLaLigne } of resultat.converties) {
        await surCorbeille(cheminDeLaLigne);
      }
      surArbreModifie();
      return null;
    }
    const description = config.champs.find((champ) => champ.nom === nomDeDescription && champ.type === 'texte')?.nom ?? null;
    const creer = async (lignesACreer: readonly TableRow[], parent: string): Promise<void> => {
      for (const ligne of lignesACreer) {
        const creee = await api.creerPage({
          parent,
          titre: ligne.titre === '' ? 'Sans titre' : ligne.titre,
        });
        if (!creee.ok) {
          throw new Error(creee.erreur.message);
        }
        const page = creee.page.chemin;
        for (const [champ, valeur] of Object.entries(ligne.valeurs)) {
          if (champ !== description) {
            const ecrite = await api.changerValeurDeBase({
              base: chemin,
              ligne: page,
              champ,
              valeur,
            });
            if (!ecrite.ok) {
              throw new Error(ecrite.erreur.message);
            }
          }
        }
        const texte = description === null ? '' : (ligne.valeurs[description] ?? '');
        if (texte !== '') {
          const lu = await api.lirePage({ chemin: page });
          if (lu.ok) {
            await api.enregistrerPage({
              chemin: page,
              corps: corpsDuTexte(texte),
              corpsDeBase: lu.corps,
            });
          }
        }
        await creer(ligne.enfants, page);
      }
    };
    try {
      await creer(lignesDuTableau, chemin);
    } catch (probleme) {
      surArbreModifie();
      return `Conversion interrompue : ${probleme instanceof Error ? probleme.message : String(probleme)} Les pages déjà créées restent ; la base est toujours sans pages.`;
    }
    const { lignes: _lignes, ...sansMode } = config;
    await changerConfig({
      ...sansMode,
      champs: config.champs.filter((champ) => champ.nom !== description),
      repliees: [],
    });
    surArbreModifie();
    return null;
  };

  /** Retire un champ. Sans pages, ses valeurs n'ont pas d'autre place que le tableau : on demande avant de les effacer. */
  const retirerChamp = (nom: string): void => {
    if (base === null) {
      return;
    }
    const aDesValeurs = sansPages && aPlat.some(({ ligne }) => (ligne.valeurs[nom] ?? '') !== '');
    if (aDesValeurs && !window.confirm(`Retirer la colonne « ${nom} » efface ses valeurs de toutes les lignes. Continuer ?`)) {
      return;
    }
    void changerConfig(sansChamp(base.config, nom));
  };

  if (base === null) {
    return erreur === null ? null : (
      <p role="alert" className="bg-erreur/10 mb-4 rounded-md p-3 text-sm">
        Cette base n'a pas pu être lue : {erreur}
      </p>
    );
  }
  const { config } = base;

  const validerEdition = async (): Promise<void> => {
    if (edition === null) {
      return;
    }
    const ligne = aPlat.find((candidate) => candidate.ligne.chemin === edition.ligne)?.ligne;
    definirEdition(null);
    // Sans pages, le titre d'une ligne se modifie comme une valeur.
    if (ligne !== undefined && edition.champ === colonneDesPages) {
      if (edition.texte.trim() !== '' && edition.texte.trim() !== ligne.titre) {
        ecrireLignes(
          changerLigne(lignesDuTableau, ligne.chemin, (actuelle) => ({
            ...actuelle,
            titre: edition.texte.trim(),
          })),
        );
      }
      return;
    }
    if (ligne !== undefined && (ligne.valeurs[edition.champ] ?? '') !== edition.texte.trim()) {
      await changerValeur(ligne, edition.champ, edition.texte);
    }
  };
  const toucheDEdition = (evenement: KeyboardEvent<HTMLInputElement>): void => {
    if (evenement.key === 'Enter') {
      evenement.preventDefault();
      void validerEdition();
    } else if (evenement.key === 'Escape') {
      evenement.preventDefault();
      evenement.stopPropagation();
      definirEdition(null);
    }
  };

  /** Replie ou déplie une ligne : montré tout de suite, puis écrit dans l'en-tête (les lignes disparues en sortent). En lecture seule, montré seulement. */
  const changerRepli = (id: string, replier: boolean): void => {
    if (repliees.has(id) === replier) {
      return;
    }
    const existantes = new Set(aPlat.map(({ ligne }) => ligne.id));
    const nouvelle = {
      ...config,
      repliees: [...[...repliees].filter((autre) => autre !== id && existantes.has(autre)), ...(replier ? [id] : [])],
    };
    definirBase({ ...base, config: nouvelle });
    if (!lectureSeule) {
      void changerConfig(nouvelle);
    }
  };

  const creerLigne = async ({ titre, parent }: NouvelleLigne): Promise<void> => {
    // En liste, Entrée rouvre aussitôt un champ pour la ligne suivante (Entrée sur un champ vide le ferme) : on peut taper sans attendre la création.
    definirNouvelleLigne(titre.trim() !== '' && base.config.vue === 'liste' ? { parent, titre: '' } : null);
    if (titre.trim() === '') {
      return;
    }
    // La ligne qui reçoit une sous-ligne se déplie.
    const ligneParente = aPlat.find(({ ligne }) => ligne.chemin === parent)?.ligne;
    if (ligneParente !== undefined) {
      changerRepli(ligneParente.id, false);
    }
    if (sansPages) {
      ecrireLignes(ajouterLigne(lignesDuTableau, parent, titre));
      return;
    }
    const resultat = await api.creerPage({
      parent: parent ?? chemin,
      titre: titre.trim(),
    });
    definirErreur(resultat.ok ? null : resultat.erreur.message);
    surArbreModifie();
    await recharger();
  };

  /** Le champ où se tape le titre d'une nouvelle ligne ou sous-ligne : Entrée crée, Échap abandonne. */
  const champDeNouvelleLigne = (saisie: NouvelleLigne) => (
    <input
      autoFocus
      aria-label={saisie.parent === null ? 'Titre de la nouvelle ligne' : 'Titre de la nouvelle sous-ligne'}
      placeholder={saisie.parent === null ? 'Titre de la nouvelle ligne, puis Entrée' : 'Titre de la sous-ligne, puis Entrée'}
      value={saisie.titre}
      onChange={(evenement) => definirNouvelleLigne({ ...saisie, titre: evenement.target.value })}
      onBlur={() => definirNouvelleLigne(null)}
      onKeyDown={(evenement) => {
        if (evenement.key === 'Enter') {
          evenement.preventDefault();
          void creerLigne(saisie);
        } else if (evenement.key === 'Escape') {
          evenement.stopPropagation();
          definirNouvelleLigne(null);
        }
      }}
      className="bg-surface w-72 rounded px-2 py-1 outline-0"
    />
  );

  const largeurDe = (colonne: string): number | undefined => (largeurEnCours?.colonne === colonne ? largeurEnCours.largeur : config.largeurs[colonne]);
  const tirer = (colonne: string) => ({
    onPointerDown: (evenement: PointerEvent<HTMLDivElement>) => {
      evenement.preventDefault();
      evenement.currentTarget.setPointerCapture(evenement.pointerId);
      const largeur = evenement.currentTarget.parentElement?.getBoundingClientRect().width ?? 120;
      definirLargeurEnCours({
        colonne,
        depart: evenement.clientX,
        largeurDeDepart: largeur,
        largeur,
      });
    },
    onPointerMove: (evenement: PointerEvent<HTMLDivElement>) => {
      if (largeurEnCours?.colonne === colonne) {
        definirLargeurEnCours({
          ...largeurEnCours,
          largeur: avecLargeur(config, colonne, largeurEnCours.largeurDeDepart + evenement.clientX - largeurEnCours.depart).largeurs[colonne]!,
        });
      }
    },
    onPointerUp: () => {
      if (largeurEnCours?.colonne === colonne) {
        definirLargeurEnCours(null);
        void changerConfig(avecLargeur(config, colonne, largeurEnCours.largeur));
      }
    },
    // Double-clic : la colonne reprend la place qui reste.
    onDoubleClick: () => {
      const { [colonne]: _largeur, ...largeurs } = config.largeurs;
      void changerConfig({ ...config, largeurs });
    },
  });

  const enTete = (nom: string, champ: BaseField | null) => {
    const trie = config.tri?.champ === nom ? config.tri.sens : null;
    return (
      <th key={nom} scope="col" className={`${cellule} relative bg-(--tableau-entete) text-left font-semibold`}>
        {!lectureSeule && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label={`Largeur de la colonne ${nom}`}
            title="Tirer pour régler la largeur, double-clic pour la rendre automatique"
            {...tirer(nom)}
            className="hover:bg-accent/40 active:bg-accent/60 absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize touch-none"
          />
        )}
        {renommage !== null && champ !== null && renommage.ancien === champ.nom ? (
          <input
            autoFocus
            aria-label={`Nouveau nom du champ ${champ.nom}`}
            value={renommage.texte}
            onChange={(evenement) => definirRenommage({ ...renommage, texte: evenement.target.value })}
            onBlur={() => definirRenommage(null)}
            onKeyDown={(evenement) => {
              if (evenement.key === 'Enter') {
                evenement.preventDefault();
                const { ancien, texte } = renommage;
                definirRenommage(null);
                void renommerChamp(ancien, texte);
              } else if (evenement.key === 'Escape') {
                evenement.stopPropagation();
                definirRenommage(null);
              }
            }}
            className="bg-fond w-full rounded px-1 outline-0"
          />
        ) : (
          <span className="flex items-center gap-1">
            <button
              type="button"
              disabled={lectureSeule}
              onClick={() =>
                void changerConfig({
                  ...config,
                  tri: triSuivant(config.tri, nom),
                })
              }
              title={trie === null ? 'Trier' : trie === 'croissant' ? 'Trié, croissant : cliquer pour décroissant' : 'Trié, décroissant : cliquer pour ne plus trier'}
              className="hover:bg-texte/10 focus-visible:bg-texte/20 flex min-w-0 flex-1 items-center gap-1 rounded px-1 text-left outline-0"
            >
              <span className="truncate">{nom}</span>
              {trie === 'croissant' && <ArrowUp className="text-accent size-3.5 shrink-0" aria-label="croissant" />}
              {trie === 'decroissant' && <ArrowDown className="text-accent size-3.5 shrink-0" aria-label="décroissant" />}
            </button>
            {champ !== null && !lectureSeule && (
              <button
                type="button"
                aria-label={`Actions du champ ${champ.nom}`}
                onClick={(evenement) =>
                  definirMenu({
                    x: evenement.clientX,
                    y: evenement.clientY,
                    genre: 'champ',
                    champ,
                  })
                }
                className="text-discret hover:bg-texte/10 hover:text-texte focus-visible:bg-texte/20 flex size-5 shrink-0 items-center justify-center rounded outline-0"
              >
                <EllipsisVertical className="size-3.5" aria-hidden="true" />
              </button>
            )}
          </span>
        )}
      </th>
    );
  };

  const valeur = (ligne: BaseRow, champ: BaseField) => {
    const brute = ligne.valeurs[champ.nom] ?? '';
    const enEdition = edition?.ligne === ligne.chemin && edition.champ === champ.nom;
    if (enEdition) {
      return (
        <input
          autoFocus
          aria-label={`${champ.nom} de ${ligne.titre}`}
          type={champ.type === 'courriel' ? 'email' : 'text'}
          inputMode={champ.type === 'nombre' ? 'decimal' : undefined}
          value={edition.texte}
          onChange={(evenement) => definirEdition({ ...edition, texte: evenement.target.value })}
          onBlur={() => void validerEdition()}
          onKeyDown={toucheDEdition}
          className="bg-fond w-full rounded px-1 outline-0"
        />
      );
    }
    switch (champ.type) {
      case 'case':
        return (
          <input
            type="checkbox"
            aria-label={`${champ.nom} de ${ligne.titre}`}
            checked={brute === 'true'}
            disabled={lectureSeule}
            onChange={(evenement) => void changerValeur(ligne, champ.nom, String(evenement.target.checked))}
            className="accent-accent size-4 cursor-pointer"
          />
        );
      case 'etat':
        return (
          <button
            type="button"
            disabled={lectureSeule}
            aria-label={`${champ.nom} de ${ligne.titre} : ${brute === '' ? 'aucun' : brute}`}
            onClick={(evenement) =>
              definirMenu({
                x: evenement.clientX,
                y: evenement.clientY,
                genre: 'etat',
                ligne,
                champ: champ.nom,
              })
            }
            className="hover:bg-texte/10 focus-visible:bg-texte/20 flex min-h-6 w-full items-center rounded px-1 text-left outline-0"
          >
            {brute !== '' && (
              <span
                className="max-w-full truncate rounded-full px-2 py-0.5 text-xs font-medium"
                style={{
                  backgroundColor: `color-mix(in srgb, ${couleurDEtat(etats, brute)} 25%, transparent)`,
                  color: couleurDEtat(etats, brute),
                }}
              >
                {brute}
              </span>
            )}
          </button>
        );
      case 'choix':
        return (
          <button
            type="button"
            disabled={lectureSeule}
            aria-label={`${champ.nom} de ${ligne.titre} : ${brute === '' ? 'aucun' : brute}`}
            onClick={(evenement) =>
              definirPanneau({
                x: evenement.clientX,
                y: evenement.clientY,
                genre: 'choix',
                ligne,
                champ: champ.nom,
              })
            }
            className="hover:bg-texte/10 focus-visible:bg-texte/20 flex min-h-6 w-full items-center rounded px-1 text-left outline-0"
          >
            {brute !== '' && <ChoicePill champ={champ} valeur={brute} />}
          </button>
        );
      default:
        return (
          <button
            type="button"
            disabled={lectureSeule}
            aria-label={`${champ.nom} de ${ligne.titre}${brute === '' ? '' : ` : ${brute}`}`}
            onClick={() =>
              definirEdition({
                ligne: ligne.chemin,
                champ: champ.nom,
                texte: brute,
              })
            }
            className={`hover:bg-texte/10 focus-visible:bg-texte/20 block min-h-6 w-full truncate rounded px-1 text-left outline-0 ${champ.type === 'nombre' ? 'text-right tabular-nums' : ''}`}
          >
            {champ.type === 'courriel' && brute !== '' ? <span className="text-accent">{brute}</span> : valeurAffichee(champ.type, brute)}
          </button>
        );
    }
  };

  /** Le titre d'une ligne et ses boutons (déplier, sous-ligne, retirer), décalé selon la profondeur ; `avant` se met entre la flèche et le titre. */
  const contenuDuTitre = (ligne: BaseRow, profondeur: number, avant: ReactNode = null) => (
    <div className="flex items-start gap-1" style={{ paddingLeft: `${profondeur * 1.25}rem` }}>
      {ligne.enfants.length > 0 ? (
        <button
          type="button"
          aria-label={`${repliees.has(ligne.id) ? 'Déplier' : 'Replier'} les sous-lignes de ${ligne.titre}`}
          aria-expanded={!repliees.has(ligne.id)}
          onClick={() => changerRepli(ligne.id, !repliees.has(ligne.id))}
          className="text-discret hover:bg-texte/10 hover:text-texte focus-visible:bg-texte/20 flex size-5 shrink-0 items-center justify-center rounded outline-0"
        >
          <ChevronRight className={`size-3.5 transition-transform ${repliees.has(ligne.id) ? '' : 'rotate-90'}`} aria-hidden="true" />
        </button>
      ) : (
        <span className="size-5 shrink-0" aria-hidden="true" />
      )}
      {avant}
      {sansPages && edition?.ligne === ligne.chemin && edition.champ === colonneDesPages ? (
        <input
          autoFocus
          aria-label={`Titre de la ligne ${ligne.titre}`}
          value={edition.texte}
          onChange={(evenement) => definirEdition({ ...edition, texte: evenement.target.value })}
          onBlur={() => void validerEdition()}
          onKeyDown={toucheDEdition}
          className="bg-fond w-full min-w-0 rounded px-1 font-medium outline-0"
        />
      ) : sansPages ? (
        <button
          type="button"
          disabled={lectureSeule}
          title="Modifier le titre"
          onClick={() =>
            definirEdition({
              ligne: ligne.chemin,
              champ: colonneDesPages,
              texte: ligne.titre,
            })
          }
          className="hover:bg-texte/10 focus-visible:bg-texte/20 flex w-full min-w-0 items-start rounded px-1 text-left font-medium outline-0"
        >
          <span className="min-w-0 break-words">{ligne.titre}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={(evenement) => surOuvrirPage(ligne.id, evenement.button === 1 || !(evenement.ctrlKey || evenement.metaKey))}
          className="hover:bg-texte/10 focus-visible:bg-texte/20 flex w-full min-w-0 items-start gap-1.5 rounded px-1 text-left font-medium outline-0"
        >
          <PageIcon icone={ligne.icone} chemin={ligne.chemin} defaut={<FileText className="size-[1em] shrink-0" />} className="text-discret mt-[0.25em]" />
          <span className="min-w-0 break-words">{ligne.titre}</span>
        </button>
      )}
      {!lectureSeule && (
        <button type="button" aria-label={`Ajouter une sous-ligne à ${ligne.titre}`} title="Ajouter une sous-ligne" onClick={() => definirNouvelleLigne({ parent: ligne.chemin, titre: '' })} className={boutonDeLigne}>
          <Plus className="size-3.5" aria-hidden="true" />
        </button>
      )}
      {!lectureSeule && (
        <button
          type="button"
          aria-label={sansPages ? `Retirer la ligne ${ligne.titre}` : `Mettre la ligne ${ligne.titre} à la corbeille`}
          title={sansPages ? 'Retirer la ligne et ses sous-lignes' : "Mettre la ligne à la corbeille (sa page s'y restaure pendant 30 jours)"}
          onClick={() => (sansPages ? retirerLigne(ligne) : void surCorbeille(ligne.chemin).then(() => recharger()))}
          className={boutonDeLigne}
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );

  /** Un champ d'une ligne en vue liste : sa valeur, ou, s'il est vide, son nom à remplir d'un clic, visible au survol de la ligne seulement. */
  const celluleDeListe = (ligne: BaseRow, champ: BaseField) => {
    const vide = (ligne.valeurs[champ.nom] ?? '') === '' && !(edition?.ligne === ligne.chemin && edition.champ === champ.nom);
    const avecNom = !vide && ['texte', 'nombre', 'courriel'].includes(champ.type) && edition?.ligne !== ligne.chemin;
    return (
      <div key={champ.nom} className={`relative min-w-0 max-w-full ${avecNom ? 'pt-2' : ''} ${vide ? 'w-24 opacity-0 group-focus-within/ligne:opacity-100 group-hover/ligne:opacity-100' : ''}`}>
        {avecNom && <span className="text-discret pointer-events-none absolute -top-0.5 left-1 text-[10px] leading-none">{champ.nom}</span>}
        {valeur(ligne, champ)}
        {vide && <span className="text-discret pointer-events-none absolute inset-y-0 left-1 flex items-center truncate text-xs">{champ.nom}</span>}
      </div>
    );
  };

  return (
    <section aria-label="Base de données" className="mb-6 text-sm">
      {config.vue === 'liste' ? (
        <ul aria-label="Lignes de la base" className="space-y-0.5">
          {visibles.map(({ ligne, profondeur }) => {
            const champDeCase = champDeLaCase(config);
            const restants = config.champs.filter((champ) => champ.nom !== champDeCase?.nom);
            const etiquettes = restants.filter((champ) => champ.type === 'etat' || champ.type === 'choix');
            const autres = restants.filter((champ) => champ.type !== 'etat' && champ.type !== 'choix');
            const cochee = champDeCase !== null && ligneCochee(champDeCase, ligne.valeurs[champDeCase.nom] ?? '', etats);
            return (
              <li key={ligne.chemin}>
                <div className={`group/ligne rounded py-1 ${cochee ? 'opacity-60' : ''}`}>
                  <div className="flex items-start gap-3">
                    <div className={`min-w-0 flex-1 ${cochee ? 'line-through' : ''}`}>
                      {contenuDuTitre(
                        ligne,
                        profondeur,
                        champDeCase === null ? null : (
                          <input
                            type="checkbox"
                            aria-label={`${ligne.titre} : fait`}
                            checked={cochee}
                            disabled={lectureSeule}
                            onChange={(evenement) => void changerValeur(ligne, champDeCase.nom, valeurDeLaCase(champDeCase, evenement.target.checked, etats))}
                            className="accent-accent mt-0.5 size-4 shrink-0 cursor-pointer"
                          />
                        ),
                      )}
                    </div>
                    {/* Les étiquettes (états et choix) sont à droite du titre, sur sa ligne. */}
                    <div className="flex max-w-[45%] shrink-0 flex-wrap items-start justify-end gap-x-1 gap-y-0.5">{etiquettes.map((champ) => celluleDeListe(ligne, champ))}</div>
                  </div>
                  {autres.length > 0 && (
                    <div className="mt-0.5 flex flex-wrap items-start gap-x-2 gap-y-0.5" style={{ paddingLeft: `${profondeur * 1.25 + (champDeCase === null ? 1.5 : 2.75)}rem` }}>
                      {autres.map((champ) => celluleDeListe(ligne, champ))}
                    </div>
                  )}
                </div>
                {nouvelleLigne !== null && nouvelleLigne.parent === ligne.chemin && <div style={{ paddingLeft: `${(profondeur + 1) * 1.25 + 1.5}rem` }}>{champDeNouvelleLigne(nouvelleLigne)}</div>}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="overflow-x-auto">
          {/* Largeurs fixes : un titre très long est rogné au lieu de pousser les autres colonnes hors de la vue. */}
          <table className="w-full table-fixed border-collapse">
            <colgroup>
              {[colonneDesPages, ...config.champs.map((champ) => champ.nom)].map((colonne) => {
                const champ = config.champs.find((candidat) => candidat.nom === colonne);
                const largeur = largeurDe(colonne) ?? (champ === undefined ? undefined : largeurParDefaut(champ.type));
                return <col key={colonne} style={largeur === undefined ? undefined : { width: `${largeur}px` }} />;
              })}
              {!lectureSeule && <col style={{ width: '2rem' }} />}
            </colgroup>
            <thead>
              <tr>
                {enTete(colonneDesPages, null)}
                {config.champs.map((champ) => enTete(champ.nom, champ))}
                {!lectureSeule && (
                  <th scope="col" className="w-8 p-0">
                    <button
                      type="button"
                      aria-label="Nouvelle colonne"
                      title="Nouvelle colonne"
                      onClick={() => definirNouveauChamp({ nom: '', type: 'texte' })}
                      className="text-discret hover:bg-texte/10 hover:text-texte focus-visible:bg-texte/20 mx-auto flex size-7 items-center justify-center rounded outline-0"
                    >
                      <Plus className="size-4" aria-hidden="true" />
                    </button>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {visibles.map(({ ligne, profondeur }) => (
                <Fragment key={ligne.chemin}>
                  <tr className="group/ligne">
                    <td className={celluleCorps}>{contenuDuTitre(ligne, profondeur)}</td>
                    {config.champs.map((champ) => (
                      <td key={champ.nom} className={celluleCorps}>
                        {valeur(ligne, champ)}
                      </td>
                    ))}
                    {!lectureSeule && <td aria-hidden="true" />}
                  </tr>
                  {nouvelleLigne !== null && nouvelleLigne.parent === ligne.chemin && (
                    <tr>
                      <td colSpan={config.champs.length + 1} className={cellule}>
                        <div
                          style={{
                            paddingLeft: `${(profondeur + 1) * 1.25 + 1.5}rem`,
                          }}
                        >
                          {champDeNouvelleLigne(nouvelleLigne)}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!lectureSeule && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {nouvelleLigne === null || nouvelleLigne.parent !== null ? (
            <button
              type="button"
              onClick={() => definirNouvelleLigne({ parent: null, titre: '' })}
              className="text-discret hover:bg-texte/10 hover:text-texte focus-visible:bg-texte/20 inline-flex items-center gap-1 rounded px-2 py-1 outline-0"
            >
              <Plus className="size-4" aria-hidden="true" />
              Nouvelle ligne
            </button>
          ) : (
            champDeNouvelleLigne(nouvelleLigne)
          )}
          {nouveauChamp === null ? (
            <button
              type="button"
              onClick={() => definirNouveauChamp({ nom: '', type: 'texte' })}
              className="text-discret hover:bg-texte/10 hover:text-texte focus-visible:bg-texte/20 inline-flex items-center gap-1 rounded px-2 py-1 outline-0"
            >
              <Plus className="size-4" aria-hidden="true" />
              Nouvelle colonne
            </button>
          ) : (
            <form
              aria-label="Nouvelle colonne"
              onSubmit={(evenement) => {
                evenement.preventDefault();
                const { nom, type } = nouveauChamp;
                definirNouveauChamp(null);
                if (nom.trim() !== '') {
                  void changerConfig(avecChamp(config, nom, type));
                }
              }}
              onKeyDown={(evenement) => {
                if (evenement.key === 'Escape') {
                  evenement.stopPropagation();
                  definirNouveauChamp(null);
                }
              }}
              className="bg-surface flex items-center gap-1 rounded p-1"
            >
              <input
                autoFocus
                aria-label="Nom du champ"
                placeholder="Nom de la colonne"
                value={nouveauChamp.nom}
                onChange={(evenement) =>
                  definirNouveauChamp({
                    ...nouveauChamp,
                    nom: evenement.target.value,
                  })
                }
                className="bg-fond w-40 rounded px-2 py-0.5 outline-0"
              />
              <select
                aria-label="Type du champ"
                value={nouveauChamp.type}
                onChange={(evenement) =>
                  definirNouveauChamp({
                    ...nouveauChamp,
                    type: evenement.target.value as BaseField['type'],
                  })
                }
                className="bg-fond rounded px-1 py-0.5 outline-0"
              >
                {typesDeChamp.map(({ type, libelle }) => (
                  <option key={type} value={type}>
                    {libelle}
                  </option>
                ))}
              </select>
              <button type="submit" className="bg-accent/25 hover:bg-accent/40 focus-visible:bg-accent/50 rounded px-2 py-0.5 outline-0">
                Ajouter
              </button>
            </form>
          )}
        </div>
      )}
      {retrait !== null && (
        <p role="status" className="bg-texte/5 mt-2 flex items-center gap-2 rounded-md px-3 py-1.5">
          <span className="min-w-0 flex-1 truncate">Ligne « {retrait.titre} » retirée.</span>
          <button type="button" title="Annuler (Ctrl+Z)" onClick={() => annulerRetrait.current()} className="hover:bg-texte/10 focus-visible:bg-texte/20 inline-flex items-center gap-1 rounded px-2 py-0.5 outline-0">
            <Undo2 className="size-4" aria-hidden="true" />
            Annuler
          </button>
        </p>
      )}
      {erreur !== null && (
        <p role="alert" className="text-erreur mt-2">
          {erreur}
        </p>
      )}
      {menu !== null && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          elements={
            menu.genre === 'etat'
              ? [
                  ...etats.map((etat) => ({
                    libelle: etat.name,
                    icone: menu.ligne.valeurs[menu.champ] === etat.name ? Check : Plus,
                    action: () => void changerValeur(menu.ligne, menu.champ, etat.name),
                  })),
                  {
                    libelle: 'Aucun',
                    icone: Trash2,
                    action: () => void changerValeur(menu.ligne, menu.champ, ''),
                  },
                ]
              : [
                  {
                    libelle: 'Renommer',
                    icone: Pencil,
                    action: () =>
                      definirRenommage({
                        ancien: menu.champ.nom,
                        texte: menu.champ.nom,
                      }),
                  },
                  ...(menu.champ.type === 'choix'
                    ? [
                        {
                          libelle: 'Valeurs possibles…',
                          icone: List,
                          action: () =>
                            definirPanneau({
                              x: menu.x,
                              y: menu.y,
                              genre: 'valeurs',
                              champ: menu.champ.nom,
                            }),
                        },
                      ]
                    : []),
                  // Changer le type ne touche pas aux valeurs écrites : elles s'affichent selon le nouveau type.
                  ...typesDeChamp
                    .filter(({ type }) => type !== menu.champ.type)
                    .map(({ type, libelle }) => ({
                      libelle: `Type : ${libelle}`,
                      icone: Shapes,
                      action: () =>
                        void changerConfig(
                          avecType(
                            config,
                            menu.champ.nom,
                            type,
                            aPlat.map(({ ligne }) => ligne.valeurs[menu.champ.nom] ?? ''),
                          ),
                        ),
                    })),
                  {
                    libelle: 'Retirer le champ',
                    icone: Trash2,
                    action: () => retirerChamp(menu.champ.nom),
                  },
                ]
          }
          surFermeture={() => definirMenu(null)}
        />
      )}
      {panneau !== null &&
        (() => {
          const champ = config.champs.find((candidat) => candidat.nom === panneau.champ && candidat.type === 'choix');
          if (champ === undefined) {
            return null;
          }
          const fermer = (): void => definirPanneau(null);
          return panneau.genre === 'choix' ? (
            <ChoicePicker
              x={panneau.x}
              y={panneau.y}
              champ={champ}
              ligne={panneau.ligne.titre}
              actuelle={panneau.ligne.valeurs[champ.nom] ?? ''}
              surChoix={(valeur) => void changerValeur(panneau.ligne, champ.nom, valeur)}
              surFermeture={fermer}
            />
          ) : (
            <ChoiceEditor
              x={panneau.x}
              y={panneau.y}
              champ={champ}
              surAjouter={(nom) => void changerConfig(avecNouveauChoix(config, champ.nom, nom))}
              surRenommer={(ancien, nouveau) => void renommerChoix(champ.nom, ancien, nouveau)}
              surRetirer={(nom) => void retirerChoix(champ.nom, nom)}
              surCouleur={(nom, couleur) => void changerConfig(avecCouleurDeChoix(config, champ.nom, nom, couleur))}
              surDeplacer={(nom, pas) => void changerConfig(avecChoixDeplace(config, champ.nom, nom, pas))}
              surFermeture={fermer}
            />
          );
        })()}
      {sansPages && base.lignes.length > 0 && (
        <div className="mt-3">
          <p className="text-discret text-xs">Pages de la base (leur texte ne tient pas dans une ligne) :</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {base.lignes.map((page) => (
              <button
                key={page.id}
                type="button"
                onClick={(evenement) => surOuvrirPage(page.id, evenement.button === 1 || !(evenement.ctrlKey || evenement.metaKey))}
                className="hover:bg-texte/10 focus-visible:bg-texte/20 inline-flex items-center gap-1.5 rounded px-2 py-1 outline-0"
              >
                <PageIcon icone={page.icone} chemin={page.chemin} defaut={<FileText className="size-[1em] shrink-0" />} className="text-discret" />
                {page.titre}
              </button>
            ))}
          </div>
        </div>
      )}
      {parametresOuverts && !lectureSeule && (
        <BaseSettingsDialog
          config={config}
          surRenommerChamp={renommerChamp}
          surType={(nom, type) =>
            void changerConfig(
              avecType(
                config,
                nom,
                type,
                aPlat.map(({ ligne }) => ligne.valeurs[nom] ?? ''),
              ),
            )
          }
          surRetirerChamp={retirerChamp}
          surDeplacerChamp={(nom, pas) => void changerConfig(avecChampDeplace(config, nom, pas))}
          surAjouterChamp={(nom, type) => void changerConfig(avecChamp(config, nom, type))}
          surValeursPossibles={(nom, x, y) => definirPanneau({ x, y, genre: 'valeurs', champ: nom })}
          vue={config.vue === 'liste' ? 'liste' : 'tableau'}
          surVue={(vue) => {
            const { vue: _vue, ...autres } = config;
            void changerConfig(vue === 'liste' ? { ...autres, vue } : autres);
          }}
          analyserConversion={analyserConversion}
          convertir={convertir}
          surFermeture={surFermerParametres}
        />
      )}
    </section>
  );
}
