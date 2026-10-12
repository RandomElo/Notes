import type { ImageToConvert } from '@notes/core';
import { ImageDown } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../../lib/ipc';
import { versWebp } from './webp';

type Etat =
  | { etat: 'lecture' }
  | { etat: 'pret'; images: ImageToConvert[] }
  | { etat: 'en-cours'; fait: number; total: number }
  | { etat: 'fini'; converties: number; erreurs: string[] };

/**
 * Conversion des images déjà dans le dossier des notes (docs/spec/editeur.md) : chaque
 * image en PNG, JPEG ou AVIF qu'une page affiche est convertie en WebP
 * compressé, réduite à 1920 px, et la page renvoie à la nouvelle. L'ancien
 * fichier reste : il passe dans les images inutilisées, qu'on supprime soi-même.
 */
export function WebpConversion() {
  const [etat, definirEtat] = useState<Etat>({ etat: 'lecture' });

  useEffect(() => {
    void api.listerImagesAConvertir().then((images) => definirEtat({ etat: 'pret', images }));
  }, []);

  const convertir = async (images: ImageToConvert[]): Promise<void> => {
    const erreurs: string[] = [];
    let converties = 0;
    for (const [index, image] of images.entries()) {
      definirEtat({ etat: 'en-cours', fait: index, total: images.length });
      const lue = await api.lireImage(image);
      if (!lue.ok) {
        erreurs.push(`${image.page}/${image.nom} : ${lue.erreur.message}`);
        continue;
      }
      const webp = await versWebp({ nom: image.nom, octets: lue.octets });
      if (webp.octets === lue.octets) {
        erreurs.push(`${image.page}/${image.nom} : cette image n'a pas pu être lue pour la convertir.`);
        continue;
      }
      const resultat = await api.convertirImage({ page: image.page, ancien: image.nom, octets: webp.octets });
      if (resultat.ok) {
        converties++;
      } else {
        erreurs.push(`${image.page}/${image.nom} : ${resultat.erreur.message}`);
      }
    }
    definirEtat({ etat: 'fini', converties, erreurs });
  };

  const message =
    etat.etat === 'lecture'
      ? 'Recherche des images…'
      : etat.etat === 'pret'
        ? etat.images.length === 0
          ? 'Toutes les images sont déjà en WebP (ou en GIF, en SVG, gardés tels quels).'
          : etat.images.length === 1
            ? 'Une image en PNG, JPEG ou AVIF.'
            : `${etat.images.length} images en PNG, JPEG ou AVIF.`
        : etat.etat === 'en-cours'
          ? `Conversion : ${etat.fait} sur ${etat.total}…`
          : `${etat.converties === 1 ? 'Une image convertie' : `${etat.converties} images converties`}. Les anciens fichiers sont dans les images inutilisées.`;

  return (
    <section aria-labelledby="titre-webp" className="space-y-4">
      <div>
        <h2 id="titre-webp" className="text-xl font-semibold">
          Images en WebP
        </h2>
        <p className="text-discret mt-1 text-sm">
          Les nouvelles images sont enregistrées en WebP compressé, 1920 px de large au plus. Ici, les images déjà dans le dossier des notes. Les anciens
          fichiers restent, rien n'est supprimé.
        </p>
      </div>
      <div className="bg-surface space-y-3 rounded-lg p-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p role="status">{message}</p>
          {etat.etat === 'pret' && etat.images.length > 0 && (
            <button
              type="button"
              onClick={() => void convertir(etat.images)}
              className="bg-accent/20 hover:bg-accent/35 focus-visible:bg-accent/45 inline-flex h-8 items-center justify-center gap-2 rounded-md px-3 leading-none font-medium whitespace-nowrap outline-0"
            >
              <ImageDown className="size-4 shrink-0" aria-hidden="true" />
              Convertir
            </button>
          )}
        </div>
        {etat.etat === 'fini' && etat.erreurs.length > 0 && (
          <ul role="alert" className="space-y-1">
            {etat.erreurs.map((erreur) => (
              <li key={erreur} className="text-erreur font-mono text-xs">
                {erreur}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
