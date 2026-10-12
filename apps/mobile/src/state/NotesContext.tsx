import {
  LocalFsError,
  LockManager,
  PullCache,
  RemoteFsError,
  cheminDuFichierPage,
  creerPageSurLeNas,
  estHoteValide,
  fichierDuTheme,
  indexerTitres,
  lireArbre,
  modifierPageSurLeNas,
  sousDossierDistant,
  validerReglagesNas,
  verifierTitre,
  VaultError,
} from '@notes/core';
import type { DirectWriteContext, NasSettings, PageChange, PageLocation, RemoteFs, TitleEntry, TreeNode } from '@notes/core';
// Le thème seul, pas l'index : il chargerait l'éditeur au lancement.
import { lireTheme, themeParDefaut } from '@notes/ui/theme';
import type { Theme } from '@notes/ui/theme';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Environnement } from '../platform/environment';
import type { SessionSmb } from '../platform/plugins';
import { versErreurDistante } from '../platform/smb-remote-fs';
import { avecPageRecente, cleDuCache, fichierDesReglages, lireReglagesDuTelephone, nomDuTelephone, reglagesVides } from './phone-settings';
import type { PhoneSettings } from './phone-settings';
import { avecPagesEnAttente, cheminEnAttente, estEnAttente, fichierDesPagesEnAttente, lirePagesEnAttente } from './pending-pages';
import type { PageEnAttente } from './pending-pages';
import { codesBloquants, messageDeRefus } from './sync-status';
import { ecrireCopie, fichierDeLArborescence, lireCopie } from './tree-snapshot';
import type { EtatNas } from './sync-status';
import { messageDErreur, messageDuResultat, messageHorsReseau } from './writes';

/** Le verrou d'une saisie en cours est rafraîchi bien avant ses 90 s de vie (docs/spec/sync.md). */
const intervalleDuVerrouMs = 30_000;

/** Toutes les 30 s au premier plan (docs/spec/sync.md). */
export const intervalleDeSyncMs = 30_000;
const fichierDeLIndex = 'cache-index.json';

interface NotesValue {
  env: Environnement;
  /** Faux tant que les réglages ne sont pas lus. */
  pret: boolean;
  reglages: PhoneSettings;
  motDePasse: boolean;
  arbre: TreeNode[];
  titres: Map<string, TitleEntry>;
  theme: Theme;
  etat: EtatNas;
  /** Adresse par laquelle passe la session ouverte, null sans session. */
  voie: 'local' | 'tailscale' | null;
  /** Augmente à chaque changement du cache : une page ouverte se relit. */
  versionDuCache: number;
  /**
   * `manuel` : demandée par Eloi (pastille, tirer l'accueil), elle passe outre un refus précédent du NAS.
   * `rouvrir` : le réseau a changé, la session est refaite par l'adresse qui répond maintenant.
   */
  synchroniser(manuel?: boolean, rouvrir?: boolean): Promise<void>;
  /** Essaie la connexion avec ce mot de passe ; s'il marche, il est enregistré et une sync part. Rend la session ou lève l'erreur. */
  seConnecter(nas: NasSettings, hoteTailscale: string, motDePasse: string): Promise<SessionSmb>;
  oublierMotDePasse(): Promise<void>;
  noterPageOuverte(id: string): void;
  /** Un fichier du vault, du cache ou à défaut du NAS. */
  lireFichier(chemin: string): Promise<Uint8Array>;
  /** Date de la dernière modification de chaque page sur le NAS, par dossier (pages récentes de l'accueil). */
  datesDesPages(): Promise<Map<string, number>>;
  /** Vrai quand le NAS répond : les contrôles de modification sont actifs (docs/spec/android.md). */
  modifiable: boolean;
  /**
   * Modifie une page directement sur le NAS (docs/spec/sync.md). Vrai si c'est fait
   * (ou qu'il n'y avait rien à changer) ; sinon le message est montré, et le
   * cache a la version du NAS.
   */
  modifierPage(page: string, changement: PageChange): Promise<boolean>;
  /**
   * Crée une page sur le NAS. Sans NAS, elle attend sur le téléphone et part
   * au retour du NAS (son chemin est alors celui d'une page en attente). Rend
   * son emplacement, ou null si c'est refusé (message montré).
   */
  creerPage(parent: string, titre: string, modeListe: boolean): Promise<Pick<PageLocation, 'chemin'> | null>;
  /** Le chemin d'une page, celui qu'elle a reçu sur le NAS si elle était en attente. */
  cheminActuel(chemin: string): string;
  /** La page créée sans NAS de ce chemin, telle qu'elle attend (contenu compris), null sinon. */
  pageEnAttente(chemin: string): PageEnAttente | null;
  /** Ce qui est écrit dans une page en attente : gardé sur le téléphone, envoyé avec elle (choix d'Eloi, 2026-10-11). */
  ecrireEnAttente(chemin: string, corps: string): Promise<void>;
  /** Saisie en cours sur une page : son verrou est pris et entretenu jusqu'à `finirSaisie`. Faux si refusé (message montré). */
  commencerSaisie(page: string): Promise<boolean>;
  finirSaisie(page: string): Promise<void>;
  /** Le dossier des notes sur le NAS, null tant que rien n'est réglé. */
  distantDuVault: RemoteFs | null;
  /**
   * Appelé à chaque sync, une fois le NAS joint, avant la copie des pages :
   * les mémos vocaux en attente partent là (J17). Rend le désabonnement.
   */
  surNasJoint(rappel: () => Promise<void>): () => void;
  /** Message bref en bas de l'écran (refus d'une modification). */
  avis: string | null;
  montrerAvis(message: string | null): void;
}

const Contexte = createContext<NotesValue | null>(null);

export function useNotes(): NotesValue {
  const valeur = useContext(Contexte);
  if (valeur === null) {
    throw new Error('useNotes hors de NotesProvider.');
  }
  return valeur;
}

export function NotesProvider({ env, children }: { env: Environnement; children: ReactNode }) {
  const [pret, definirPret] = useState(false);
  const [reglages, definirReglages] = useState<PhoneSettings>(reglagesVides);
  const [motDePasse, definirMotDePasse] = useState(false);
  const [arbreDuCache, definirArbre] = useState<TreeNode[]>([]);
  const [pagesEnAttente, definirPagesEnAttente] = useState<PageEnAttente[]>([]);
  const attenteCourante = useRef<PageEnAttente[]>([]);
  /** Pages en attente créées depuis sur le NAS : leur ancien chemin vers le nouveau, pour l'écran resté ouvert dessus. */
  const creees = useRef(new Map<string, string>());
  const arbre = useMemo(() => avecPagesEnAttente(arbreDuCache, pagesEnAttente), [arbreDuCache, pagesEnAttente]);
  const [theme, definirTheme] = useState<Theme>(themeParDefaut);
  const [etat, definirEtat] = useState<EtatNas>({ genre: 'inconnu' });
  const [voie, definirVoie] = useState<'local' | 'tailscale' | null>(null);
  const [versionDuCache, definirVersionDuCache] = useState(0);
  const [avis, definirAvis] = useState<string | null>(null);
  const titres = useMemo(() => indexerTitres(arbre), [arbre]);

  const reglagesCourants = useRef(reglages);
  const enCours = useRef(false);
  /** Un refus du NAS arrête les essais automatiques jusqu'à la prochaine connexion. */
  const bloque = useRef(false);

  const enregistrerReglages = useCallback(
    async (suivants: PhoneSettings) => {
      reglagesCourants.current = suivants;
      definirReglages(suivants);
      await env.fichiers.ecrire(fichierDesReglages, JSON.stringify(suivants));
    },
    [env],
  );

  const enregistrerAttente = useCallback(
    async (suivantes: PageEnAttente[]) => {
      attenteCourante.current = suivantes;
      definirPagesEnAttente(suivantes);
      await env.fichiers.ecrire(fichierDesPagesEnAttente, JSON.stringify(suivantes));
    },
    [env],
  );

  const nas = reglages.nas;
  const appareil = reglages.appareil;
  const distantDuVault = useMemo(() => (nas === null ? null : sousDossierDistant(env.distant, nas.dossierVault)), [env, nas]);
  const cache = useMemo(
    () =>
      nas === null || distantDuVault === null
        ? null
        : new PullCache({
            local: env.local,
            distant: distantDuVault,
            index: { lire: () => env.fichiers.lire(fichierDeLIndex), ecrire: (texte) => env.fichiers.ecrire(fichierDeLIndex, texte) },
            cle: cleDuCache(nas),
          }),
    [env, nas, distantDuVault],
  );
  const ecriture = useMemo<DirectWriteContext | null>(
    () =>
      cache === null || distantDuVault === null || appareil === null
        ? null
        : {
            distant: distantDuVault,
            verrous: new LockManager(distantDuVault, { appareil, nom: nomDuTelephone, pid: 0 }, Date.now),
            maintenant: Date.now,
            copierDansLeCache: (chemin, contenu) => cache.noterCopie(chemin, contenu),
          },
    [cache, distantDuVault, appareil],
  );

  /** Relit l'arborescence et le thème depuis le cache. */
  const recharger = useCallback(async () => {
    const lu = await lireArbre(env.local).catch(() => []);
    definirArbre(lu);
    const texteDuTheme = await env.local.lireTexte(fichierDuTheme).catch(() => null);
    definirTheme(lireTheme(texteDuTheme).theme);
    definirVersionDuCache((version) => version + 1);
    // La copie montrée au prochain lancement, avant la relecture du cache.
    const nasCourant = reglagesCourants.current.nas;
    if (nasCourant !== null) {
      await env.fichiers.ecrire(fichierDeLArborescence, ecrireCopie(cleDuCache(nasCourant), { arbre: lu, theme: texteDuTheme })).catch(() => undefined);
    }
  }, [env]);

  const abonnesAuNas = useRef(new Set<() => Promise<void>>());
  const surNasJoint = useCallback((rappel: () => Promise<void>) => {
    abonnesAuNas.current.add(rappel);
    return () => void abonnesAuNas.current.delete(rappel);
  }, []);

  /** Un seul envoi à la fois : celui d'une création et celui d'une sync ne doivent pas créer deux fois la même page. */
  const envoiEnCours = useRef<Promise<void>>(Promise.resolve());

  /** Les pages créées sans NAS partent sur le NAS, dans l'ordre. Une coupure laisse les suivantes pour la fois d'après. */
  const envoyerLesPagesEnAttente = useCallback((): Promise<void> => {
    const envoi = envoiEnCours.current.catch(() => undefined).then(() => envoyerMaintenant());
    envoiEnCours.current = envoi;
    return envoi;
  // envoyerMaintenant est redéfini à chaque rendu ; la file, elle, reste la même.
  }, [ecriture, enregistrerAttente, recharger, env]);

  async function envoyerMaintenant(): Promise<void> {
    if (ecriture === null || attenteCourante.current.length === 0) {
      return;
    }
    const octetsAleatoires = (taille: number) => crypto.getRandomValues(new Uint8Array(taille));
    const ecritPendantLEnvoi: { chemin: string; envoye: string; dernier: string }[] = [];
    for (const page of [...attenteCourante.current]) {
      let creee: PageLocation;
      try {
        creee = await creerPageSurLeNas({ ...ecriture, octetsAleatoires, cache: env.local }, page);
      } catch (erreur) {
        // Parent supprimé ou renommé sur le PC entre-temps : la page va à la racine plutôt que d'être perdue.
        if (!(erreur instanceof VaultError) || page.parent === '') {
          throw erreur;
        }
        creee = await creerPageSurLeNas({ ...ecriture, octetsAleatoires, cache: env.local }, { ...page, parent: '' });
      }
      creees.current.set(cheminEnAttente(page.cle), creee.chemin);
      const dernier = attenteCourante.current.find((autre) => autre.cle === page.cle)?.corps ?? page.corps;
      if (dernier !== page.corps) {
        ecritPendantLEnvoi.push({ chemin: creee.chemin, envoye: page.corps, dernier });
      }
      await enregistrerAttente(attenteCourante.current.filter((autre) => autre.cle !== page.cle));
    }
    await recharger();
    // Ce qui a été tapé pendant la création suit, comme une modification ordinaire.
    for (const { chemin, envoye, dernier } of ecritPendantLEnvoi) {
      await modifierPage(chemin, { corpsAttendu: envoye, operation: () => dernier });
    }
  }

  const synchroniser = useCallback(async (manuel = false, rouvrir = false) => {
    const reglagesNas = reglagesCourants.current.nas;
    if (enCours.current || cache === null || reglagesNas === null || (bloque.current && !manuel)) {
      return;
    }
    enCours.current = true;
    try {
      if (!(await env.reseauPresent())) {
        definirEtat((avant) => ({ genre: 'injoignable', depuis: avant.genre === 'injoignable' ? avant.depuis : Date.now(), horsReseau: true }));
        return;
      }
      definirEtat({ genre: 'synchro', faits: 0, total: 0 });
      bloque.current = false;
      const session = await env.connecter(reglagesNas, { hoteTailscale: reglagesCourants.current.hoteTailscale, rouvrir });
      definirVoie(session.parTailscale ? 'tailscale' : 'local');
      await envoyerLesPagesEnAttente();
      for (const rappel of abonnesAuNas.current) {
        // Son échec (coupure) ne regarde que lui : la copie des pages le constatera aussi.
        await rappel().catch(() => undefined);
      }
      const rapport = await cache.tirer((faits, total) => definirEtat({ genre: 'synchro', faits, total }));
      await enregistrerReglages({ ...reglagesCourants.current, derniereSync: Date.now() });
      if (rapport.copies.length > 0 || rapport.retires.length > 0) {
        await recharger();
      }
      definirEtat(rapport.distantVide ? { genre: 'erreur', message: 'Le dossier des notes est vide sur le NAS : rien retiré du téléphone' } : { genre: 'a-jour' });
    } catch (erreur) {
      definirVoie(null);
      if (erreur instanceof LocalFsError) {
        definirEtat({ genre: 'erreur', message: `Stockage du téléphone : ${erreur.message}` });
        return;
      }
      const distante = versErreurDistante(erreur);
      if (codesBloquants.has(distante.code)) {
        bloque.current = true;
        definirEtat({ genre: 'refuse', message: messageDeRefus(distante.code) });
      } else {
        definirEtat((avant) => ({ genre: 'injoignable', depuis: avant.genre === 'injoignable' ? avant.depuis : Date.now(), horsReseau: false }));
      }
      // Ce qui a été copié avant la coupure est déjà dans le cache.
      await recharger();
    } finally {
      enCours.current = false;
    }
  }, [cache, env, enregistrerReglages, recharger, envoyerLesPagesEnAttente]);

  // Démarrage : réglages, cache, puis une première sync.
  useEffect(() => {
    let annule = false;
    void (async () => {
      const lus = lireReglagesDuTelephone(await env.fichiers.lire(fichierDesReglages));
      const present = await env.motDePasseEnregistre();
      const attente = lirePagesEnAttente(await env.fichiers.lire(fichierDesPagesEnAttente));
      attenteCourante.current = attente;
      definirPagesEnAttente(attente);
      if (annule) {
        return;
      }
      if (lus.appareil === null) {
        await enregistrerReglages({ ...lus, appareil: crypto.randomUUID() });
      } else {
        reglagesCourants.current = lus;
        definirReglages(lus);
      }
      definirMotDePasse(present);
      // Lancement rapide : l'arborescence de la dernière fois s'affiche tout de suite, le cache se relit derrière.
      const copie = lus.nas === null ? null : lireCopie(await env.fichiers.lire(fichierDeLArborescence), cleDuCache(lus.nas));
      if (copie !== null) {
        definirArbre(copie.arbre);
        definirTheme(lireTheme(copie.theme).theme);
        definirPret(true);
        void recharger();
        return;
      }
      await recharger();
      definirPret(true);
    })();
    return () => {
      annule = true;
    };
  }, [env, recharger, enregistrerReglages]);

  // Une sync à l'ouverture, toutes les 30 s au premier plan, au retour au premier plan et quand le réseau revient.
  useEffect(() => {
    if (!pret || !motDePasse || cache === null) {
      return;
    }
    let auPremierPlan = true;
    void synchroniser();
    const minuterie = setInterval(() => {
      if (auPremierPlan) {
        void synchroniser();
      }
    }, intervalleDeSyncMs);
    const desabonner = env.surOccasionDeSync(
      (raison) => {
        auPremierPlan = true;
        void synchroniser(false, raison === 'reseau');
      },
      () => {
        auPremierPlan = false;
      },
    );
    return () => {
      clearInterval(minuterie);
      desabonner();
    };
  }, [pret, motDePasse, cache, env, synchroniser]);

  const seConnecter = useCallback(
    async (saisis: NasSettings, hoteTailscaleSaisi: string, motDePasseSaisi: string) => {
      const validation = validerReglagesNas(saisis);
      if (!validation.ok) {
        throw new RemoteFsError('requete_invalide', Object.values(validation.erreurs)[0] ?? 'Réglages invalides.');
      }
      const hoteTailscale = hoteTailscaleSaisi.trim();
      if (hoteTailscale !== '' && !estHoteValide(hoteTailscale)) {
        throw new RemoteFsError('requete_invalide', "Adresse Tailscale : indique un nom d'hôte ou une adresse IP, sans « \\ » ni « / ».");
      }
      await env.deconnecter().catch(() => undefined);
      const session = await env.connecter(validation.valeur, { hoteTailscale, motDePasse: motDePasseSaisi });
      bloque.current = false;
      definirEtat({ genre: 'inconnu' });
      definirVoie(session.parTailscale ? 'tailscale' : 'local');
      await enregistrerReglages({ ...reglagesCourants.current, nas: validation.valeur, hoteTailscale });
      definirMotDePasse(true);
      return session;
    },
    [env, enregistrerReglages],
  );

  const oublierMotDePasse = useCallback(async () => {
    await env.deconnecter().catch(() => undefined);
    await env.oublierMotDePasse();
    definirVoie(null);
    definirMotDePasse(false);
  }, [env]);

  const noterPageOuverte = useCallback(
    (id: string) => {
      if (reglagesCourants.current.recentes[0] !== id) {
        void enregistrerReglages(avecPageRecente(reglagesCourants.current, id));
      }
    },
    [enregistrerReglages],
  );

  const lireFichier = useCallback(
    (chemin: string) => (cache === null ? Promise.reject(new LocalFsError('introuvable', 'Aucun NAS réglé.')) : cache.lire(chemin)),
    [cache],
  );

  // Grisé seulement quand on sait que le NAS ne répond pas : avant la première sync, on essaie (un échec le dit).
  const modifiable = etat.genre !== 'injoignable' && etat.genre !== 'refuse';

  /** Ouvre (ou reprend) la session SMB avant d'écrire. Lève l'erreur du NAS s'il ne répond pas. */
  const preparerEcriture = useCallback(async (): Promise<DirectWriteContext> => {
    const reglagesNas = reglagesCourants.current.nas;
    if (ecriture === null || reglagesNas === null || !(await env.reseauPresent())) {
      throw new RemoteFsError('injoignable', messageHorsReseau);
    }
    await env.connecter(reglagesNas, { hoteTailscale: reglagesCourants.current.hoteTailscale });
    return ecriture;
  }, [ecriture, env]);

  /** Une écriture a échoué : le message est montré, et un NAS qui ne répond plus le dit dans la pastille. */
  const echecDEcriture = useCallback((erreur: unknown) => {
    const message = messageDErreur(erreur);
    definirAvis(message);
    if (message === messageHorsReseau) {
      definirEtat((avant) => ({ genre: 'injoignable', depuis: avant.genre === 'injoignable' ? avant.depuis : Date.now(), horsReseau: false }));
    }
  }, []);

  const modifierPage = useCallback(
    async (page: string, changement: PageChange) => {
      try {
        const contexte = await preparerEcriture();
        const resultat = await modifierPageSurLeNas(contexte, page, changement);
        await recharger();
        const refus = messageDuResultat(resultat);
        definirAvis(refus);
        return refus === null;
      } catch (erreur) {
        echecDEcriture(erreur);
        return false;
      }
    },
    [preparerEcriture, recharger, echecDEcriture],
  );

  /**
   * La page s'ouvre tout de suite : elle entre dans les pages en attente, puis
   * part sur le NAS en arrière-plan s'il répond (l'écran suit son nouveau
   * chemin), ou à la synchronisation suivante sinon.
   */
  const creerPage = useCallback(
    async (parent: string, titre: string, modeListe: boolean): Promise<Pick<PageLocation, 'chemin'> | null> => {
      const refus = verifierTitre(titre);
      if (refus !== null) {
        definirAvis(refus);
        return null;
      }
      const page: PageEnAttente = { cle: crypto.randomUUID(), parent, titre: titre.trim(), modeListe, creeLe: Date.now(), corps: '' };
      await enregistrerAttente([...attenteCourante.current, page]);
      if (!modifiable) {
        definirAvis('Pas de NAS : la page est gardée sur le téléphone et partira sur le NAS dès qu’il répondra.');
      } else {
        void (async () => {
          try {
            await preparerEcriture();
            await envoyerLesPagesEnAttente();
          } catch (erreur) {
            echecDEcriture(erreur);
            definirAvis('Pas de NAS : la page est gardée sur le téléphone et partira sur le NAS dès qu’il répondra.');
          }
        })();
      }
      return { chemin: cheminEnAttente(page.cle) };
    },
    [modifiable, preparerEcriture, envoyerLesPagesEnAttente, echecDEcriture, enregistrerAttente],
  );

  const datesDesPages = useCallback(async () => (cache === null ? new Map<string, number>() : cache.datesDesPages().catch(() => new Map<string, number>())), [cache]);

  const cheminActuel = useCallback((chemin: string) => creees.current.get(chemin) ?? chemin, []);

  // Lit la file courante, pas l'état : une deuxième modification rapide part de la première.
  const pageEnAttente = useCallback(
    (chemin: string) => attenteCourante.current.find((page) => cheminEnAttente(page.cle) === chemin) ?? null,
    // pagesEnAttente : recalculée quand la file change, pour que l'écran relise le contenu.
    [pagesEnAttente],
  );

  const ecrireEnAttente = useCallback(
    async (chemin: string, corps: string) => {
      await enregistrerAttente(attenteCourante.current.map((page) => (cheminEnAttente(page.cle) === chemin ? { ...page, corps } : page)));
    },
    [enregistrerAttente],
  );

  const relireLaPage = useCallback(
    async (contexte: DirectWriteContext, page: string) => {
      const fichier = cheminDuFichierPage(page);
      try {
        const surLeNas = await contexte.distant.lire(fichier);
        const dansLeCache = await env.local.lireOctets(fichier).catch(() => null);
        if (dansLeCache !== null && memesOctets(surLeNas, dansLeCache)) {
          return;
        }
        await contexte.copierDansLeCache(fichier, surLeNas);
        await recharger();
      } catch {
        // Une coupure : l'écriture qui suit le dira.
      }
    },
    [env, recharger],
  );

  const commencerSaisie = useCallback(
    async (page: string) => {
      if (estEnAttente(page)) {
        return true;
      }
      try {
        const contexte = await preparerEcriture();
        const prise = await contexte.verrous.prendre(page);
        if (!prise.ok) {
          definirAvis(messageDuResultat({ ok: false, raison: 'verrou', nom: prise.nom }));
        } else {
          // Le PC a priorité (choix d'Eloi, 2026-10-11) : la page est relue sur le NAS dès le début de la saisie, sans la faire
          // attendre, pour qu'une version changée sur le PC depuis la dernière sync s'affiche avant la première écriture.
          void relireLaPage(contexte, page);
        }
        return prise.ok;
      } catch (erreur) {
        echecDEcriture(erreur);
        return false;
      }
    },
    [preparerEcriture, echecDEcriture, relireLaPage],
  );

  const finirSaisie = useCallback(
    async (page: string) => {
      if (estEnAttente(page)) {
        return;
      }
      // Un verrou qu'on ne peut pas retirer (coupure) périme seul en 90 s.
      await ecriture?.verrous.relacher(page).catch(() => undefined);
    },
    [ecriture],
  );

  // Pendant une saisie, le verrou donne signe de vie ; tout est relâché si l'application se ferme.
  useEffect(() => {
    if (ecriture === null) {
      return;
    }
    const minuterie = setInterval(() => {
      if (ecriture.verrous.pagesTenues().length > 0) {
        void ecriture.verrous.entretenir(async () => 'en_attente').catch(() => undefined);
      }
    }, intervalleDuVerrouMs);
    return () => {
      clearInterval(minuterie);
      void ecriture.verrous.toutRelacher();
    };
  }, [ecriture]);

  const valeur: NotesValue = {
    env,
    pret,
    reglages,
    motDePasse,
    arbre,
    titres,
    theme,
    etat,
    voie,
    versionDuCache,
    synchroniser,
    seConnecter,
    oublierMotDePasse,
    noterPageOuverte,
    lireFichier,
    datesDesPages,
    modifiable,
    modifierPage,
    creerPage,
    cheminActuel,
    pageEnAttente,
    ecrireEnAttente,
    commencerSaisie,
    finirSaisie,
    distantDuVault,
    surNasJoint,
    avis,
    montrerAvis: definirAvis,
  };
  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

function memesOctets(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((octet, rang) => octet === b[rang]);
}
