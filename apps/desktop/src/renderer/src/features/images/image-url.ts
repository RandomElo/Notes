import { cheminDeLImage } from '@notes/ui';
import { Fragment } from '@tiptap/pm/model';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { schemaDesImages } from '../../../../shared/ipc-contract';

/**
 * Adresse à charger pour une image de la page : le protocole du main, qui ne
 * sert que les images du dossier des notes. null pour une image qui ne
 * s'affiche pas (Internet, hors du dossier des notes).
 */
export function adresseDImage(cheminDeLaPage: string, src: string): string | null {
  const chemin = cheminDeLImage(cheminDeLaPage, src);
  return chemin === null ? null : `${schemaDesImages}://vault/${chemin.split('/').map(encodeURIComponent).join('/')}`;
}

/** Dossier d'un élément de l'arborescence : la page elle-même, ou le dossier d'une note `.md` posée seule. */
export function dossierDeLaPage(chemin: string, genre: 'page' | 'dossier' | 'fichier'): string {
  return genre === 'fichier' ? chemin.split('/').slice(0, -1).join('/') : chemin;
}

/** Adresse, depuis la page « cheminDeLaPage », d'un fichier du dossier des notes : `../Projets/assets/x.webp`. */
export function adresseDepuis(cheminDeLaPage: string, cheminDansLeVault: string): string {
  const remontee = cheminDeLaPage === '' ? [] : cheminDeLaPage.split('/').map(() => '..');
  return [...remontee, ...cheminDansLeVault.split('/').map(encodeURIComponent)].join('/');
}

/** Le contenu collé, avec chaque image de la page « source » réadressée depuis la page « cible ». Rend aussi les fichiers concernés. */
export function readresserImages(contenu: Fragment, source: string, cible: string): { contenu: Fragment; fichiers: Map<string, string> } {
  const fichiers = new Map<string, string>();
  const parcourir = (fragment: Fragment): Fragment => {
    const enfants: ProseMirrorNode[] = [];
    fragment.forEach((noeud) => {
      if (noeud.type.name === 'image') {
        const fichier = cheminDeLImage(source, String(noeud.attrs['src']));
        if (fichier !== null) {
          const adresse = adresseDepuis(cible, fichier);
          fichiers.set(adresse, fichier);
          enfants.push(noeud.type.create({ ...noeud.attrs, src: adresse }, noeud.content, noeud.marks));
          return;
        }
      }
      enfants.push(noeud.copy(parcourir(noeud.content)));
    });
    return Fragment.fromArray(enfants);
  };
  return { contenu: parcourir(contenu), fichiers };
}
