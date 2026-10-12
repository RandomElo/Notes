import { joindreChemins } from '../fs/paths';
import { RemoteAsLocalFs } from '../fs/remote-as-local';
import type { RemoteFs } from '../fs/remote-fs';
import { versOctets, versTexte } from '../fs/utf8';
import { assemblerPage, decouperPage } from '../page/front-matter';
import type { FrontMatterChanges } from '../page/front-matter';
import type { LocalFs } from '../fs/local-fs';
import { genererId } from '../page/id';
import { nomDeDossier, nomLibre, verifierTitre } from '../page/naming';
import { cheminDuFichierPage, modifierMetaDansTexte, texteDePageNeuve } from '../page/page-file';
import { VaultError } from '../vault/context';
import { idsDesEnfants } from '../vault/operations';
import type { PageLocation } from '../vault/operations';
import { fichierOrdre, lireOrdre } from '../vault/order';
import type { LockManager } from './lock';

/*
 * Écriture depuis le téléphone (README §5, « Écriture depuis Android ») : pas
 * de copie modifiée en attente, chaque modification va directement sur le
 * NAS, sous le verrou de la page, appliquée à la version fraîchement relue.
 * Le cache n'est mis à jour qu'une fois le NAS écrit. Le téléphone ne peut
 * donc pas créer de conflit.
 */

export interface DirectWriteContext {
  /** Le dossier du vault sur le NAS, vu comme une racine. */
  distant: RemoteFs;
  /** Verrous de ce téléphone. Une page déjà tenue (saisie en cours) le reste après l'écriture. */
  verrous: LockManager;
  maintenant(): number;
  /** Recopie dans le cache un fichier que l'on vient d'écrire ou de relire sur le NAS. */
  copierDansLeCache(chemin: string, contenu: Uint8Array): Promise<void>;
}

export type DirectWriteResult =
  /** `texte` : le fichier tel qu'il est maintenant sur le NAS. */
  | { ok: true; ecrit: boolean; texte: string }
  /** Un autre appareil édite la page. */
  | { ok: false; raison: 'verrou'; nom: string }
  /** La page a changé sur le NAS depuis son affichage : rien n'est écrit, le cache a la nouvelle version. */
  | { ok: false; raison: 'changee'; texte: string }
  | { ok: false; raison: 'introuvable' };

export interface PageChange {
  /** Le corps sur lequel l'opération a été préparée (celui affiché), ou null pour l'appliquer à ce qu'il y a. */
  corpsAttendu: string | null;
  /** Rend le nouveau corps, ou null pour ne rien écrire. */
  operation: (corps: string) => string | null;
  /** Changements de l'en-tête (icône de la page), appliqués en plus. */
  meta?: FrontMatterChanges;
}

/**
 * Applique une modification au corps d'une page, sur le NAS : verrou,
 * relecture, application, écriture, cache, déverrouillage. Échoue avec
 * l'erreur du NAS s'il ne répond pas, sans rien avoir changé.
 */
export async function modifierPageSurLeNas(contexte: DirectWriteContext, page: string, { corpsAttendu, operation, meta }: PageChange): Promise<DirectWriteResult> {
  const { distant, verrous } = contexte;
  const fichier = cheminDuFichierPage(page);
  const infos = await distant.infos(fichier);
  if (infos === null || infos.estDossier) {
    return { ok: false, raison: 'introuvable' };
  }
  const dejaTenu = verrous.pagesTenues().includes(page);
  if (!dejaTenu) {
    const prise = await verrous.prendre(page);
    if (!prise.ok) {
      return { ok: false, raison: 'verrou', nom: prise.nom };
    }
  }
  try {
    const octets = await distant.lire(fichier);
    const texte = versTexte(octets);
    const morceaux = decouperPage(texte);
    if (corpsAttendu !== null && morceaux.corps !== corpsAttendu) {
      await contexte.copierDansLeCache(fichier, octets);
      return { ok: false, raison: 'changee', texte };
    }
    const corps = operation(morceaux.corps) ?? morceaux.corps;
    let modifie =
      corps === morceaux.corps
        ? texte
        : assemblerPage({
            ...morceaux,
            corps,
            apresFermeture: morceaux.apresFermeture === '' && corps !== '' ? morceaux.finDeLigne : morceaux.apresFermeture,
          });
    if (meta !== undefined) {
      modifie = modifierMetaDansTexte(modifie, meta);
    }
    if (modifie === texte) {
      return { ok: true, ecrit: false, texte };
    }
    const nouveau = modifierMetaDansTexte(modifie, { modifieLe: new Date(contexte.maintenant()).toISOString() });
    const ecrits = versOctets(nouveau);
    await distant.ecrire(fichier, ecrits);
    await contexte.copierDansLeCache(fichier, ecrits);
    return { ok: true, ecrit: true, texte: nouveau };
  } finally {
    if (!dejaTenu) {
      // Un verrou qu'on n'arrive pas à retirer (coupure) périme seul en 90 s.
      await verrous.relacher(page).catch(() => undefined);
    }
  }
}

/**
 * Crée une page simple sur le NAS (README §15), avec les mêmes règles que sur
 * le desktop (nom du dossier, page en dernier dans l'ordre du parent), puis
 * la recopie dans le cache avec l'ordre du parent. Le NAS n'est interrogé que
 * pour l'essentiel (parent, noms pris, ordre) : les pages sœurs se lisent dans
 * le cache, qui les a toutes, au lieu d'ouvrir chacune sur le NAS. `corps` :
 * ce qui a été écrit dans la page pendant qu'elle attendait le NAS sur le
 * téléphone (choix d'Eloi, 2026-10-11).
 */
export async function creerPageSurLeNas(
  contexte: DirectWriteContext & { octetsAleatoires(taille: number): Uint8Array; cache: LocalFs },
  demande: { parent: string; titre: string; modeListe: boolean; corps?: string },
): Promise<PageLocation> {
  const { distant } = contexte;
  const refus = verifierTitre(demande.titre);
  if (refus !== null) {
    throw new VaultError('titre_invalide', refus);
  }
  const titre = demande.titre.trim();
  if (demande.parent !== '' && (await distant.infos(cheminDuFichierPage(demande.parent))) === null) {
    throw new VaultError('introuvable', `Page parente introuvable : ${demande.parent}`);
  }
  const noms = (await distant.lister(demande.parent)).map((entree) => entree.nom);
  const ordreDuNas = noms.includes(fichierOrdre) ? await lireOrdre(new RemoteAsLocalFs(distant), demande.parent) : [];
  const ordreDuCache = await idsDesEnfants(contexte.cache, demande.parent).catch(() => []);
  const id = genererId(contexte.maintenant(), contexte.octetsAleatoires(10));
  const date = new Date(contexte.maintenant()).toISOString();
  const chemin = joindreChemins(demande.parent, nomLibre(nomDeDossier(titre), noms));
  const neuve = texteDePageNeuve({ id, titre, creeLe: date, modifieLe: date }, demande.corps ?? '');
  const page = versOctets(demande.modeListe ? modifierMetaDansTexte(neuve, { mode: 'todo' }) : neuve);
  const ids = [...ordreDuNas, ...ordreDuCache.filter((autre) => !ordreDuNas.includes(autre)), id];
  const ordre = versOctets(`${ids.join('\n')}\n`);

  await distant.creerDossier(chemin);
  await distant.ecrire(cheminDuFichierPage(chemin), page);
  await distant.ecrire(joindreChemins(demande.parent, fichierOrdre), ordre);
  await contexte.copierDansLeCache(cheminDuFichierPage(chemin), page);
  await contexte.copierDansLeCache(joindreChemins(demande.parent, fichierOrdre), ordre);
  return { chemin, id };
}
