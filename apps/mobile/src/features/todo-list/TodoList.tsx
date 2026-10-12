import { ajouterItemApres, ajouterTache, basculerTache, decalerADroite, decalerAGauche, deplacerItem, documentDuCorps, modifierTexteDItem, supprimerItem } from '@notes/document';
import type { Transform } from '@tiptap/pm/transform';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Check, ChevronDown, ListIndentDecrease, ListIndentIncrease, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent as PointerEventReact, ReactNode } from 'react';
import { brancherFermeture } from '../quick-edit/auto-pairs';
import { useNotes } from '../../state/NotesContext';
import { lignesDeTaches } from './todo-rows';
import type { LigneDeTache } from './todo-rows';

interface TodoListProps {
  /** Dossier de la page sur le NAS. */
  page: string;
  /** Corps affiché, modifications pas encore confirmées comprises : les opérations sont préparées dessus. */
  corps: string;
  /** Applique une opération à l'écran tout de suite, puis l'écrit sur le NAS (usePageWrites). */
  appliquer: (operation: (tr: Transform) => unknown) => boolean;
  /** Faux sans NAS : la liste se lit, rien ne s'écrit. Une page créée sans NAS s'écrit toujours. */
  modifiable: boolean;
  /** Rendu en lecture seule des blocs posés sous une tâche ou hors de la liste. */
  rendreBlocs: (markdown: string) => ReactNode;
}

/** Où se tape une nouvelle tâche : après la ligne « apres » (rang dans `lignes`), ou seule dans une liste vide. */
type Brouillon = {
  apres: number | null;
  texte: string;
  /** Niveaux de décalage par rapport à la ligne « apres » : +1 sous elle, -1 un niveau plus haut. */
  decalage: number;
};

/** Durée d'un appui long avant que la tâche se mette à glisser. */
const dureeDAppuiLongMs = 500;
/** Un glissement plus large que ce seuil vers la droite ou la gauche décale la tâche d'un niveau. */
const seuilDeDecalagePx = 40;
/** Retrait d'un niveau de sous-tâche, et course horizontale montrée pendant le glissement. */
const largeurDeNiveauPx = 28;

/** Une tâche sœur de celle qu'on glisse, avec ses sous-tâches : lignes `debut` à `fin` (exclue). */
interface GroupeSoeur {
  debut: number;
  fin: number;
  milieu: number;
  hauteur: number;
}

interface Glissement {
  /** Première et dernière (exclue) lignes du groupe tenu, et sa hauteur. */
  index: number;
  fin: number;
  hauteur: number;
  dx: number;
  dy: number;
  rangActuel: number;
  /** Place visée parmi les sœurs (sans la tâche tenue), et décalage de niveau visé : -1, 0 ou +1. */
  cible: number;
  niveau: number;
  autres: GroupeSoeur[];
}

/** Position de l'item de rang « rang » dans la liste qui commence à « debut ». */
function positionDuRang(document: ProseMirrorNode, debut: number, rang: number): number {
  const liste = document.nodeAt(debut);
  let position = debut + 1;
  for (let index = 0; index < rang && liste !== null && index < liste.childCount; index += 1) {
    position += liste.child(index).nodeSize;
  }
  return position;
}

/** Le verrou est relâché un peu après la fin d'une saisie, pour ne pas le rendre puis le reprendre en passant d'une ligne à l'autre. */
const delaiDeRelacheMs = 1500;
/** Sans frappe pendant ce temps, la ligne en cours est validée et le verrou rendu. */
const inactiviteDeSaisieMs = 60_000;

/**
 * Page en mode liste sur le téléphone, façon Keep (docs/spec/liste-de-taches.md, docs/spec/android.md, choix
 * d'Eloi du 2026-10-10) : toucher le texte d'une tâche l'édite sur place,
 * Entrée crée la tâche suivante, × la supprime, l'enregistrement se fait en
 * quittant la ligne ; un appui long fait glisser une tâche, en hauteur pour
 * la ranger, de côté pour la décaler d'un niveau. Chaque
 * modification va directement sur le NAS, sous le verrou de la page.
 */
export function TodoList({ page, corps, appliquer, modifiable, rendreBlocs }: TodoListProps) {
  const { commencerSaisie, finirSaisie, montrerAvis } = useNotes();
  const { lignes, horsListe } = useMemo(() => lignesDeTaches(documentDuCorps(corps)), [corps]);
  const [edition, definirEdition] = useState<{ index: number; texte: string } | null>(null);
  const [brouillon, definirBrouillon] = useState<Brouillon | null>(null);
  const [termineReplie, definirTermineReplie] = useState(false);
  const [glisse, definirGlisse] = useState<Glissement | null>(null);
  const relache = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lignesDom = useRef(new Map<number, HTMLDivElement>());

  // En quittant la page, le verrou est rendu, qu'une saisie soit en cours ou non.
  useEffect(
    () => () => {
      if (relache.current !== null) {
        clearTimeout(relache.current);
      }
      void finirSaisie(page);
    },
    [finirSaisie, page],
  );

  // Sur Android, toucher une zone vide ne retire pas le focus du champ : la saisie se termine à tout toucher hors de la ligne en cours.
  const enSaisie = edition !== null || brouillon !== null;
  useEffect(() => {
    if (!enSaisie) {
      return;
    }
    const toucher = (evenement: PointerEvent): void => {
      const actif = document.activeElement;
      const cible = evenement.target as Node;
      if (actif instanceof HTMLTextAreaElement && !actif.parentElement?.parentElement?.contains(cible)) {
        actif.blur();
      }
    };
    document.addEventListener('pointerdown', toucher, true);
    return () => document.removeEventListener('pointerdown', toucher, true);
  }, [enSaisie]);

  // Une saisie abandonnée (téléphone posé, clavier ouvert) ne garde pas la page : au bout d'une minute sans frappe, la ligne est validée.
  useEffect(() => {
    if (!enSaisie) {
      return;
    }
    const minuterie = setTimeout(() => {
      if (document.activeElement instanceof HTMLTextAreaElement) {
        document.activeElement.blur();
      }
    }, inactiviteDeSaisieMs);
    return () => clearTimeout(minuterie);
  }, [enSaisie, edition, brouillon]);

  const saisir = useCallback(async () => {
    if (relache.current !== null) {
      clearTimeout(relache.current);
      relache.current = null;
    }
    return commencerSaisie(page);
  }, [commencerSaisie, page]);

  const finirPlusTard = useCallback(() => {
    if (relache.current !== null) {
      clearTimeout(relache.current);
    }
    relache.current = setTimeout(() => {
      relache.current = null;
      void finirSaisie(page);
    }, delaiDeRelacheMs);
  }, [finirSaisie, page]);

  const refuserHorsLigne = (): boolean => {
    if (!modifiable) {
      montrerAvis('Le NAS ne répond pas : la liste est en lecture seule.');
      return true;
    }
    return false;
  };

  /** Prend le verrou de la page en arrière-plan : la saisie s'ouvre sans attendre ; si le PC édite la page, elle se referme avec un message. */
  const saisirEnFond = (): void => {
    void saisir().then((pris) => {
      if (!pris) {
        definirEdition(null);
        definirBrouillon(null);
      }
    });
  };

  const cocher = (ligne: LigneDeTache): void => {
    if (refuserHorsLigne()) {
      return;
    }
    appliquer((tr) => basculerTache(tr, ligne.position, !ligne.coche, true));
  };

  const commencerEdition = (index: number): void => {
    if (refuserHorsLigne()) {
      return;
    }
    definirBrouillon(null);
    definirEdition({ index, texte: lignes[index]!.texte });
    saisirEnFond();
  };

  /** Rang dans `lignes` de ce qui suit la ligne « index » et ses sous-tâches : là où arrive une tâche ajoutée après elle. */
  const rangApres = (index: number): number => {
    let suivant = index + 1;
    while (suivant < lignes.length && lignes[suivant]!.profondeur > lignes[index]!.profondeur) {
      suivant += 1;
    }
    return suivant;
  };

  const validerEdition = (continuer: boolean, saisi?: string): void => {
    if (edition === null) {
      return;
    }
    const ligne = lignes[edition.index];
    const texte = saisi ?? edition.texte;
    definirEdition(null);
    if (ligne !== undefined) {
      if (texte.trim() === '') {
        appliquer((tr) => supprimerItem(tr, ligne.position));
      } else if (texte.trim() !== ligne.texte.trim()) {
        appliquer((tr) => modifierTexteDItem(tr, ligne.position, texte));
      }
    }
    // Entrée sur une tâche vidée la supprime et s'arrête là, comme Keep.
    if (continuer && ligne !== undefined && !ligne.termine && texte.trim() !== '') {
      definirBrouillon({ apres: edition.index, texte: '', decalage: 0 });
    } else {
      finirPlusTard();
    }
  };

  const validerBrouillon = (continuer: boolean, saisi?: string): void => {
    if (brouillon === null) {
      return;
    }
    const { apres, decalage } = brouillon;
    const texte = saisi ?? brouillon.texte;
    if (texte.trim() === '') {
      definirBrouillon(null);
      finirPlusTard();
      return;
    }
    const ligne = apres === null ? null : lignes[apres];
    const fait = appliquer((tr) => (ligne === null || ligne === undefined ? ajouterTache(tr, texte) : ajouterItemApres(tr, ligne.position, texte, decalage)));
    if (!fait) {
      return;
    }
    // La tâche ajoutée est la ligne qui suit ; la suivante se tape après elle.
    const nouvelle = apres === null ? 0 : rangApres(apres);
    if (continuer) {
      definirBrouillon({ apres: nouvelle, texte: '', decalage: 0 });
    } else {
      definirBrouillon(null);
      finirPlusTard();
    }
  };

  /**
   * Décale la tâche en cours de saisie d'un niveau (« React » contient
   * « HTML » qui contient « head »). Le texte tapé part avec ; la saisie
   * continue sur la même tâche, qui garde son rang dans l'ordre de lecture.
   */
  const decaler = (ligne: LigneDeTache, sens: 'droite' | 'gauche'): void => {
    const texte = edition?.texte;
    const fait = appliquer((tr) => {
      if (texte !== undefined && texte.trim() !== '' && texte.trim() !== ligne.texte.trim()) {
        modifierTexteDItem(tr, ligne.position, texte);
      }
      return sens === 'droite' ? decalerADroite(tr, ligne.position) : decalerAGauche(tr, ligne.position);
    });
    if (!fait) {
      montrerAvis(sens === 'droite' ? 'Rien au-dessus de cette tâche pour la ranger dessous.' : 'Cette tâche est déjà au premier niveau.');
    }
  };

  const supprimer = (ligne: LigneDeTache): void => {
    definirEdition(null);
    appliquer((tr) => supprimerItem(tr, ligne.position));
    finirPlusTard();
  };

  /*
   * Glisser (choix d'Eloi, 2026-10-11) : appui long sur une tâche à faire, à
   * tout niveau, puis le doigt bouge. Vers le haut ou le bas, elle change de
   * place parmi ses sœurs, sous-tâches comprises ; vers la droite ou la gauche,
   * comme dans Keep, elle se range sous la tâche du dessus ou remonte d'un
   * niveau. Les tâches de « Terminé » ne glissent pas.
   */
  const appui = useRef<{ index: number; x: number; y: number; minuterie: ReturnType<typeof setTimeout> } | null>(null);
  const clicAbsorbe = useRef(false);

  /** Fin (exclue) du groupe d'une ligne : elle et ses sous-tâches, qui glissent avec elle. */
  const finDuGroupe = (index: number): number => {
    let fin = index + 1;
    while (fin < lignes.length && lignes[fin]!.profondeur > lignes[index]!.profondeur) {
      fin += 1;
    }
    return fin;
  };

  const commencerAppui = (index: number, evenement: PointerEventReact): void => {
    const ligne = lignes[index]!;
    if (evenement.button !== 0 || edition !== null || ligne.enTermine) {
      return;
    }
    const { clientX: x, clientY: y } = evenement;
    appui.current = {
      index,
      x,
      y,
      minuterie: setTimeout(() => {
        appui.current = null;
        if (refuserHorsLigne()) {
          return;
        }
        navigator.vibrate?.(15);
        clicAbsorbe.current = true;
        suivreLeDoigt(index, x, y);
      }, dureeDAppuiLongMs),
    };
  };

  const annulerAppui = (evenement?: PointerEventReact): void => {
    if (appui.current !== null && (evenement === undefined || Math.hypot(evenement.clientX - appui.current.x, evenement.clientY - appui.current.y) > 10)) {
      clearTimeout(appui.current.minuterie);
      appui.current = null;
    }
  };

  /** Pendant le glissement : le groupe suit le doigt, la page ne défile pas, la place visée se calcule sur les milieux des groupes sœurs. */
  const suivreLeDoigt = (index: number, departX: number, departY: number): void => {
    const ligne = lignes[index]!;
    const groupes: GroupeSoeur[] = lignes.flatMap((autre, i) => {
      if (autre.liste !== ligne.liste || autre.enTermine) {
        return [];
      }
      const fin = finDuGroupe(i);
      const haut = lignesDom.current.get(i)?.getBoundingClientRect().top ?? 0;
      const bas = lignesDom.current.get(fin - 1)?.getBoundingClientRect().bottom ?? haut;
      return [{ debut: i, fin, milieu: (haut + bas) / 2, hauteur: bas - haut }];
    });
    const rangActuel = groupes.findIndex((groupe) => groupe.debut === index);
    const moi = groupes[rangActuel]!;
    const autres = groupes.filter((groupe) => groupe !== moi);
    let cible = rangActuel;
    let niveau = 0;
    definirGlisse({ index, fin: moi.fin, hauteur: moi.hauteur, dx: 0, dy: 0, rangActuel, cible, niveau, autres });
    const bloquerDefilement = (evenement: TouchEvent): void => evenement.preventDefault();
    const deplacer = (evenement: PointerEvent): void => {
      const dx = evenement.clientX - departX;
      const dy = evenement.clientY - departY;
      cible = autres.filter((groupe) => groupe.milieu < moi.milieu + dy).length;
      niveau = dx > seuilDeDecalagePx ? 1 : dx < -seuilDeDecalagePx ? -1 : 0;
      definirGlisse({ index, fin: moi.fin, hauteur: moi.hauteur, dx, dy, rangActuel, cible, niveau, autres });
    };
    const lacher = (): void => {
      window.removeEventListener('pointermove', deplacer);
      window.removeEventListener('pointerup', lacher);
      window.removeEventListener('pointercancel', lacher);
      window.removeEventListener('touchmove', bloquerDefilement);
      definirGlisse(null);
      if (cible === rangActuel && niveau === 0) {
        return;
      }
      const rang = cible;
      const decalage = niveau;
      appliquer((tr) => {
        let position = ligne.position;
        if (rang !== rangActuel && deplacerItem(tr, position, rang)) {
          position = positionDuRang(tr.doc, ligne.liste, rang);
        }
        if (decalage === 1) {
          decalerADroite(tr, position);
        } else if (decalage === -1) {
          decalerAGauche(tr, position);
        }
      });
    };
    window.addEventListener('pointermove', deplacer);
    window.addEventListener('pointerup', lacher);
    window.addEventListener('pointercancel', lacher);
    window.addEventListener('touchmove', bloquerDefilement, { passive: false });
  };

  /** Décalage visuel pendant le glissement : le groupe tenu suit le doigt, les groupes sœurs s'écartent pour ouvrir la place visée. */
  const decalageDe = (index: number): { x: number; y: number } => {
    if (glisse === null) {
      return { x: 0, y: 0 };
    }
    if (index >= glisse.index && index < glisse.fin) {
      return { x: Math.max(-largeurDeNiveauPx, Math.min(largeurDeNiveauPx, glisse.dx)), y: glisse.dy };
    }
    const rang = glisse.autres.findIndex((groupe) => index >= groupe.debut && index < groupe.fin);
    if (rang === -1) {
      return { x: 0, y: 0 };
    }
    const dessous = glisse.autres[rang]!.debut > glisse.index;
    if (dessous && rang < glisse.cible) {
      return { x: 0, y: -glisse.hauteur };
    }
    if (!dessous && rang >= glisse.cible) {
      return { x: 0, y: glisse.hauteur };
    }
    return { x: 0, y: 0 };
  };

  const touche = (evenement: KeyboardEvent, valider: (continuer: boolean, saisi?: string) => void): void => {
    if (evenement.key === 'Enter' && !evenement.shiftKey) {
      evenement.preventDefault();
      valider(true);
    } else if (evenement.key === 'Escape') {
      evenement.preventDefault();
      (evenement.target as HTMLElement).blur();
    }
  };

  /** Champ d'une ligne. Le clavier d'Android n'envoie pas toujours Entrée en touche : un saut de ligne tapé vaut Entrée. */
  const champ = (valeur: string, changer: (texte: string) => void, valider: (continuer: boolean, saisi?: string) => void, libelle: string) => (
    <textarea
      ref={brancherFermeture}
      autoFocus
      aria-label={libelle}
      value={valeur}
      rows={1}
      enterKeyHint="next"
      onChange={(evenement) => {
        const saisi = evenement.target.value;
        if (saisi.includes('\n')) {
          const ligne = saisi.replace(/\n/g, ' ').trimEnd();
          changer(ligne);
          valider(true, ligne);
        } else {
          changer(saisi);
        }
      }}
      onKeyDown={(evenement) => touche(evenement, valider)}
      onBlur={() => valider(false)}
      onFocus={(evenement) => {
        // Le curseur à la fin du texte, comme Keep.
        const fin = evenement.currentTarget.value.length;
        evenement.currentTarget.setSelectionRange(fin, fin);
      }}
      onInput={(evenement) => {
        const zone = evenement.currentTarget;
        zone.style.height = 'auto';
        zone.style.height = `${zone.scrollHeight}px`;
      }}
      className="ligne-de-tache block w-full resize-none overflow-hidden bg-transparent outline-none"
    />
  );

  /** La ligne où se tape une nouvelle tâche, à la profondeur de la ligne d'avant, décalable avant d'être enregistrée. */
  const ligneBrouillon = (profondeurDAvant: number) => {
    if (brouillon === null) {
      return false;
    }
    const profondeur = Math.max(0, profondeurDAvant + brouillon.decalage);
    // Une ligne neuve se range sous celle d'au-dessus (un niveau de plus, pas davantage) ou remonte jusqu'au premier niveau.
    const peutDescendre = brouillon.apres !== null && brouillon.decalage < 1;
    const peutRemonter = profondeur > 0;
    return (
      <div className="flex items-start gap-1 rounded-lg bg-texte/5" style={{ paddingLeft: profondeur * 28 }}>
        <span className="flex size-11 shrink-0 items-center justify-center">
          <span className="size-5 rounded-[5px] bg-texte/15" />
        </span>
        <div className="min-w-0 flex-1">{champ(brouillon.texte, (texte) => definirBrouillon({ ...brouillon, texte }), validerBrouillon, 'Nouvelle tâche')}</div>
        {boutonDeDecalage('gauche', !peutRemonter, () => definirBrouillon({ ...brouillon, decalage: brouillon.decalage - 1 }))}
        {boutonDeDecalage('droite', !peutDescendre, () => definirBrouillon({ ...brouillon, decalage: brouillon.decalage + 1 }))}
      </div>
    );
  };

  const boutonDeDecalage = (sens: 'droite' | 'gauche', desactive: boolean, action: () => void) => (
    <button
      type="button"
      aria-label={sens === 'droite' ? 'Ranger sous la tâche du dessus' : 'Remonter d’un niveau'}
      // Garde le focus dans le champ : le clavier reste ouvert.
      onPointerDown={(evenement) => evenement.preventDefault()}
      onClick={action}
      disabled={desactive}
      className="flex size-11 shrink-0 items-center justify-center rounded-full text-discret outline-none active:bg-texte/15 disabled:opacity-30"
    >
      {sens === 'droite' ? <ListIndentIncrease className="size-5" /> : <ListIndentDecrease className="size-5" />}
    </button>
  );

  const premierTermine = lignes.findIndex((ligne) => ligne.termine);
  const nombreTermine = lignes.filter((ligne) => ligne.termine).length;

  return (
    <div className="select-none" onClickCapture={(evenement) => {
      if (clicAbsorbe.current) {
        clicAbsorbe.current = false;
        evenement.stopPropagation();
        evenement.preventDefault();
      }
    }}>
      {brouillon !== null && brouillon.apres === null && ligneBrouillon(0)}
      {lignes.every((ligne) => ligne.termine) && brouillon === null && (
        // Une liste vide (ou toute cochée) montre sa case (docs/spec/liste-de-taches.md) : la toucher ouvre une tâche, en tête.
        <button
          type="button"
          onClick={() => {
            if (!refuserHorsLigne()) {
              definirBrouillon({ apres: null, texte: '', decalage: 0 });
              saisirEnFond();
            }
          }}
          className="flex w-full items-center gap-1 rounded-lg text-left text-discret outline-none active:bg-texte/10"
        >
          <span className="flex size-11 shrink-0 items-center justify-center">
            <span className="size-5 rounded-[5px] bg-texte/15" />
          </span>
          <span className="ligne-de-tache">{lignes.length === 0 ? 'Liste vide' : 'Tout est coché'}</span>
        </button>
      )}
      {lignes.map((ligne, index) => {
        if (termineReplie && ligne.enTermine && index !== premierTermine) {
          return null;
        }
        const enEdition = edition?.index === index;
        const tenue = glisse !== null && index >= glisse.index && index < glisse.fin;
        return (
          <div key={index}>
            {index === premierTermine && (
              <button
                type="button"
                onClick={() => definirTermineReplie(!termineReplie)}
                className="mt-4 mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-discret outline-none active:bg-texte/10"
              >
                <ChevronDown className={`size-4 transition-transform ${termineReplie ? '-rotate-90' : ''}`} />
                Terminé ({nombreTermine})
              </button>
            )}
            {!(termineReplie && ligne.enTermine) && (
              <div
                ref={(element) => {
                  if (element === null) {
                    lignesDom.current.delete(index);
                  } else {
                    lignesDom.current.set(index, element);
                  }
                }}
                data-tache={ligne.texteBrut}
                onPointerDown={(evenement) => commencerAppui(index, evenement)}
                onPointerMove={annulerAppui}
                onPointerUp={() => annulerAppui()}
                onPointerCancel={() => annulerAppui()}
                onContextMenu={(evenement) => evenement.preventDefault()}
                style={{
                  paddingLeft: ligne.profondeur * largeurDeNiveauPx,
                  transform: `translate(${decalageDe(index).x}px, ${decalageDe(index).y}px)`,
                }}
                className={`relative flex items-start gap-1 rounded-lg ${tenue ? 'z-10 bg-surface shadow-lg' : glisse !== null ? 'transition-transform' : ''} ${enEdition ? 'bg-texte/5' : ''}`}
              >
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={ligne.coche}
                  aria-label={ligne.coche ? `Décocher « ${ligne.texteBrut} »` : `Cocher « ${ligne.texteBrut} »`}
                  onClick={() => cocher(ligne)}
                  className="flex size-11 shrink-0 items-center justify-center rounded-full outline-none active:bg-texte/15"
                >
                  <span className={`flex size-5 items-center justify-center rounded-[5px] ${ligne.coche ? 'bg-accent text-fond' : 'bg-texte/15'} ${modifiable ? '' : 'opacity-50'}`}>
                    {ligne.coche && <Check className="size-4" strokeWidth={3} />}
                  </span>
                </button>
                <div className="min-w-0 flex-1">
                  {enEdition ? (
                    champ(edition.texte, (texte) => definirEdition({ index, texte }), validerEdition, 'Texte de la tâche')
                  ) : (
                    <div
                      onClick={() => commencerEdition(index)}
                      className={`ligne-de-tache break-words ${ligne.coche ? 'text-discret line-through' : ''} ${ligne.texteBrut === '' ? 'text-discret italic' : ''}`}
                    >
                      {ligne.texteBrut === '' ? 'Tâche vide' : ligne.texteBrut}
                    </div>
                  )}
                </div>
                {enEdition && (
                  <>
                    {boutonDeDecalage('gauche', ligne.profondeur === 0, () => decaler(ligne, 'gauche'))}
                    {boutonDeDecalage('droite', false, () => decaler(ligne, 'droite'))}
                  </>
                )}
                {enEdition && (
                  <button
                    type="button"
                    aria-label="Supprimer la tâche"
                    // Garde le focus dans le champ : sinon sa validation passerait avant la suppression.
                    onPointerDown={(evenement) => evenement.preventDefault()}
                    onClick={() => supprimer(ligne)}
                    className="flex size-11 shrink-0 items-center justify-center rounded-full text-discret outline-none active:bg-texte/15"
                  >
                    <X className="size-5" />
                  </button>
                )}
              </div>
            )}
            {ligne.blocsSous !== '' && !(termineReplie && ligne.termine) && <div style={{ paddingLeft: ligne.profondeur * 28 + 48 }}>{rendreBlocs(ligne.blocsSous)}</div>}
            {brouillon !== null && brouillon.apres !== null && rangApres(brouillon.apres) - 1 === index && ligneBrouillon(lignes[brouillon.apres]?.profondeur ?? 0)}
          </div>
        );
      })}
      {horsListe !== '' && <div className="mt-4">{rendreBlocs(horsListe)}</div>}
    </div>
  );
}
