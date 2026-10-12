import type { LocalFs } from '../fs/local-fs';
import { joindreChemins } from '../fs/paths';
import type { RemoteFs } from '../fs/remote-fs';
import { dossierDesMemos } from './memos';

/*
 * Envoi des mémos enregistrés sur le téléphone (J17, docs/spec/memos.md). Le mémo est
 * d'abord rangé dans un dossier privé de l'application ; il part dans
 * `.notes/memos/` dès que le NAS répond, puis est retiré du téléphone. Seule
 * exception, avec les pages créées hors ligne, à « rien sans le NAS » : un
 * mémo n'est pas une page et ne peut pas créer de conflit.
 */

/** Nom d'un mémo tel que le téléphone l'enregistre (`nomDeMemo`), seul accepté à l'envoi. */
const nomEnregistre = /^memo-\d{4}-\d{2}-\d{2}-\d{6}\.m4a$/;

export interface PendingMemo {
  nom: string;
  taille: number;
}

/** Mémos qui attendent dans le dossier privé, du plus ancien au plus récent. Un fichier vide (enregistrement raté) n'en est pas un. */
export async function listerMemosEnAttente(attente: LocalFs): Promise<PendingMemo[]> {
  return (await attente.lister(''))
    .filter((entree) => !entree.estDossier && entree.taille > 0 && nomEnregistre.test(entree.nom))
    .map(({ nom, taille }) => ({ nom, taille }))
    .sort((a, b) => (a.nom < b.nom ? -1 : a.nom > b.nom ? 1 : 0));
}

/**
 * Envoie les mémos en attente dans `.notes/memos/` du vault (`distant` est la
 * racine du vault sur le NAS), un par un, du plus ancien au plus récent.
 * Un mémo n'est retiré du téléphone qu'une fois écrit. Le nom d'un mémo est
 * sa date à la seconde : un fichier de ce nom déjà sur le NAS est un envoi
 * dont la suppression locale n'a pas eu lieu, il n'est ni renvoyé ni écrasé.
 * Une erreur du NAS arrête l'envoi et remonte ; les mémos restants attendent
 * la fois suivante. Un mémo retiré entre-temps par un autre envoi (celui
 * d'Android, application fermée) n'est pas une erreur. Rend les noms envoyés.
 */
export async function envoyerMemosEnAttente(
  attente: LocalFs,
  distant: RemoteFs,
  surEnvoye: (nom: string) => void = () => undefined,
): Promise<string[]> {
  const memos = await listerMemosEnAttente(attente);
  if (memos.length === 0) {
    return [];
  }
  await distant.creerDossier(dossierDesMemos);
  const envoyes: string[] = [];
  for (const memo of memos) {
    const chemin = joindreChemins(dossierDesMemos, memo.nom);
    try {
      if ((await distant.infos(chemin)) === null) {
        await distant.ecrire(chemin, await attente.lireOctets(memo.nom));
      }
      await attente.supprimer(memo.nom);
    } catch (erreur) {
      // L'envoi en arrière-plan du téléphone (J17) l'a déjà envoyé et retiré : rien de perdu.
      if ((await attente.infos(memo.nom)) !== null) {
        throw erreur;
      }
    }
    envoyes.push(memo.nom);
    surEnvoye(memo.nom);
  }
  return envoyes;
}

