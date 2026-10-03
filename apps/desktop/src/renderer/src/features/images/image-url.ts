import { cheminDeLImage } from '@notes/ui';
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
