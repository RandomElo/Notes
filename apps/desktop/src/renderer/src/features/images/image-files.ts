import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, Selection } from '@tiptap/pm/state';
import { lienDImage } from './image-link';
import { fichiersDImage, insererImages } from './insert-images';
import { api } from '../../lib/ipc';
import { versWebp } from './webp';
import type { ImageFile } from './webp';

/**
 * Convertit puis copie des images dans le dossier `assets/` de la page. Rend
 * les adresses à insérer, et un message pour chaque image refusée.
 */
export async function ajouterEnWebp(chemin: string, fichiers: ImageFile[]): Promise<{ adresses: string[]; erreurs: string[] }> {
  const adresses: string[] = [];
  const erreurs: string[] = [];
  for (const fichier of fichiers) {
    const converti = await versWebp(fichier);
    const resultat = await api.ajouterImage({ chemin, nom: converti.nom, octets: converti.octets });
    if (resultat.ok) {
      adresses.push(...resultat.adresses);
    } else {
      erreurs.push(`${fichier.nom === null ? "L'image" : `« ${fichier.nom} »`} n'a pas été ajoutée : ${resultat.erreur.message}`);
    }
  }
  return { adresses, erreurs };
}

export interface ImageFilesOptions {
  /** Chemin actuel de la page : il change si elle est renommée pendant qu'elle est ouverte. */
  chemin: () => string;
  /** Une image n'a pas pu être ajoutée : le message à afficher. */
  surErreur: (message: string) => void;
  /** Le lien d'une image d'Internet a été collé à « position » : il faut demander s'il faut la télécharger. */
  surLienDImage: (adresse: string, position: number) => void;
}

/**
 * Images collées ou déposées dans la page (README §6) : chaque fichier est
 * converti en WebP, copié par le main dans le dossier `assets/` de la page,
 * puis inséré là où il a été collé ou déposé.
 */
export const ImageFiles = Extension.create<ImageFilesOptions>({
  name: 'imagesDeposees',

  addOptions() {
    return { chemin: () => '', surErreur: () => undefined, surLienDImage: () => undefined };
  },

  addProseMirrorPlugins() {
    const { editor } = this;
    const options = this.options;
    const ajouter = async (fichiers: File[], position: number): Promise<void> => {
      const recus = await Promise.all(
        fichiers.map(async (fichier) => ({
          // Une image collée depuis une capture d'écran s'appelle « image.png » : elle prendra la date.
          nom: fichier.name === '' || fichier.name === 'image.png' ? null : fichier.name,
          octets: new Uint8Array(await fichier.arrayBuffer()),
        })),
      );
      const { adresses, erreurs } = await ajouterEnWebp(options.chemin(), recus);
      erreurs.forEach((message) => options.surErreur(message));
      insererImages(editor, adresses, position);
    };

    return [
      new Plugin({
        key: new PluginKey('imagesDeposees'),
        props: {
          handlePaste(vue, evenement) {
            if (!vue.editable) {
              return false;
            }
            const fichiers = fichiersDImage(evenement.clipboardData);
            if (fichiers.length > 0) {
              void ajouter(fichiers, vue.state.selection.from);
              return true;
            }
            // Le lien d'une image d'Internet : rien n'est collé avant la réponse à la question.
            const lien = lienDImage(evenement.clipboardData?.getData('text/plain') ?? '');
            if (lien !== null && vue.state.selection.$from.parent.type.name !== 'codeBlock') {
              options.surLienDImage(lien, vue.state.selection.from);
              return true;
            }
            return false;
          },
          // Un clic dans le vide du bloc image (à côté de l'image, sous sa légende) le quitte : sa barre se ferme.
          handleClickOn(vue, _position, noeud, positionDuNoeud, evenement) {
            if (noeud.type.name !== 'image' || (evenement.target instanceof Element && evenement.target.closest('img') !== null)) {
              return false;
            }
            // Le curseur va dans le texte qui suit, ou à défaut dans celui qui précède : jamais sur l'image elle-même.
            const apres = vue.state.doc.resolve(Math.min(positionDuNoeud + noeud.nodeSize, vue.state.doc.content.size));
            const ailleurs = Selection.findFrom(apres, 1, true) ?? Selection.findFrom(vue.state.doc.resolve(positionDuNoeud), -1, true);
            if (ailleurs !== null) {
              vue.dispatch(vue.state.tr.setSelection(ailleurs));
            }
            return true;
          },
          handleDrop(vue, evenement) {
            const fichiers = fichiersDImage(evenement.dataTransfer);
            if (fichiers.length === 0 || !vue.editable) {
              return false;
            }
            evenement.preventDefault();
            const lieu = vue.posAtCoords({ left: evenement.clientX, top: evenement.clientY });
            void ajouter(fichiers, lieu?.pos ?? vue.state.selection.from);
            return true;
          },
        },
      }),
    ];
  },
});
