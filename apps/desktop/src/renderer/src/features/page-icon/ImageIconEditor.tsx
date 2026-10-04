import { Check, Download, Eraser, ImagePlus, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { api } from '../../lib/ipc';
import { cadrageInitial, deplacer, rectangleSource, tailleDeLApercu, tailleDeLIcone, zoomer } from './crop';
import type { Crop } from './crop';

/** Côté de l'image donnée au modèle de détourage. */
const coteDuModele = 320;

interface ImageIconEditorProps {
  enCours: boolean;
  /** Le WebP 128 × 128 de l'icône, prêt à copier dans la page. */
  surValidation: (octets: Uint8Array) => void;
  surErreur: (message: string | null) => void;
}

/** Le carré choisi de l'image, à la taille demandée, avec le détourage s'il y en a un. */
function dessiner(image: ImageBitmap, cadrage: Crop, cote: number, masque: OffscreenCanvas | null): OffscreenCanvas {
  const toile = new OffscreenCanvas(cote, cote);
  const contexte = toile.getContext('2d');
  if (contexte === null) {
    return toile;
  }
  const { x, y, cote: coteSource } = rectangleSource(cadrage, image.width, image.height);
  contexte.imageSmoothingQuality = 'high';
  contexte.drawImage(image, x, y, coteSource, coteSource, 0, 0, cote, cote);
  if (masque !== null) {
    // Le masque garde l'image là où il est opaque : le fond devient transparent.
    contexte.globalCompositeOperation = 'destination-in';
    contexte.drawImage(masque, 0, 0, cote, cote);
  }
  return toile;
}

/**
 * Icône image (README §6) : une image choisie, recadrée en carré (glisser
 * pour déplacer, molette ou curseur pour zoomer), réduite à 128 × 128 et
 * enregistrée en WebP. « Retirer le fond » détoure le carré choisi par un
 * modèle local, sans réseau.
 */
export function ImageIconEditor({ enCours, surValidation, surErreur }: ImageIconEditorProps) {
  const [image, definirImage] = useState<ImageBitmap | null>(null);
  const [cadrage, definirCadrage] = useState<Crop | null>(null);
  const [masque, definirMasque] = useState<OffscreenCanvas | null>(null);
  const [detourage, definirDetourage] = useState<'non' | 'en-cours'>('non');
  const apercu = useRef<HTMLCanvasElement>(null);
  const glisse = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => () => image?.close(), [image]);

  useEffect(() => {
    const toile = apercu.current;
    const contexte = toile?.getContext('2d');
    if (image === null || cadrage === null || toile === null || toile === undefined || contexte === null || contexte === undefined) {
      return;
    }
    contexte.clearRect(0, 0, toile.width, toile.height);
    contexte.drawImage(dessiner(image, cadrage, toile.width, masque), 0, 0);
  }, [image, cadrage, masque]);

  const [adresse, definirAdresse] = useState('');
  const [telechargement, definirTelechargement] = useState(false);

  const recevoir = async (resultat: Awaited<ReturnType<typeof api.choisirImages>>, quoi: string): Promise<void> => {
    if (!resultat.ok) {
      surErreur(`${quoi} : ${resultat.erreur.message}`);
      return;
    }
    const fichier = resultat.fichiers[0];
    if (fichier === undefined) {
      return;
    }
    try {
      const lue = await createImageBitmap(new Blob([fichier.octets as BlobPart]));
      definirImage(lue);
      definirCadrage(cadrageInitial(lue.width, lue.height));
      definirMasque(null);
    } catch {
      surErreur("Ce fichier n'est pas une image que Notes sait lire.");
    }
  };

  const choisir = async (): Promise<void> => {
    surErreur(null);
    await recevoir(await api.choisirImages(), "L'image n'a pas pu être lue");
  };

  /** Image d'Internet : téléchargée par le main (http ou https, sans cookies, nature vérifiée), jamais chargée par la page. */
  const telecharger = async (): Promise<void> => {
    const lien = adresse.trim();
    if (!/^https?:\/\/\S+$/i.test(lien)) {
      surErreur("L'adresse doit commencer par https:// ou http://.");
      return;
    }
    surErreur(null);
    definirTelechargement(true);
    const resultat = await api.telechargerImage({ adresse: lien });
    definirTelechargement(false);
    await recevoir(resultat, "L'image n'a pas été téléchargée");
  };

  // Changer le cadrage fait perdre le détourage, calculé pour l'ancien carré.
  const recadrer = (suivant: Crop): void => {
    definirCadrage(suivant);
    definirMasque(null);
  };

  const retirerLeFond = async (): Promise<void> => {
    if (image === null || cadrage === null) {
      return;
    }
    definirDetourage('en-cours');
    surErreur(null);
    const entree = dessiner(image, cadrage, coteDuModele, null);
    const pixels = entree.getContext('2d')?.getImageData(0, 0, coteDuModele, coteDuModele).data;
    const resultat = pixels === undefined ? null : await api.retirerLeFond({ pixels: new Uint8Array(pixels.buffer.slice(0)), cote: coteDuModele });
    definirDetourage('non');
    if (resultat === null || !resultat.ok) {
      surErreur(resultat === null ? "Le fond n'a pas pu être retiré." : resultat.message);
      return;
    }
    const toile = new OffscreenCanvas(coteDuModele, coteDuModele);
    const donnees = new ImageData(coteDuModele, coteDuModele);
    resultat.masque.forEach((valeur, index) => {
      donnees.data[index * 4 + 3] = valeur;
    });
    toile.getContext('2d')?.putImageData(donnees, 0, 0);
    definirMasque(toile);
  };

  const valider = async (): Promise<void> => {
    if (image === null || cadrage === null) {
      return;
    }
    const blob = await dessiner(image, cadrage, tailleDeLIcone, masque).convertToBlob({ type: 'image/webp', quality: 0.9 });
    surValidation(new Uint8Array(await blob.arrayBuffer()));
  };

  const surAppui = (evenement: PointerEvent<HTMLCanvasElement>): void => {
    evenement.currentTarget.setPointerCapture(evenement.pointerId);
    glisse.current = { x: evenement.clientX, y: evenement.clientY };
  };
  const surMouvement = (evenement: PointerEvent<HTMLCanvasElement>): void => {
    if (glisse.current === null || image === null || cadrage === null) {
      return;
    }
    recadrer(deplacer(cadrage, evenement.clientX - glisse.current.x, evenement.clientY - glisse.current.y, image.width, image.height));
    glisse.current = { x: evenement.clientX, y: evenement.clientY };
  };

  const bouton = 'hover:bg-texte/10 focus-visible:bg-texte/20 flex h-8 shrink-0 items-center gap-1.5 rounded px-2.5 text-sm whitespace-nowrap outline-0 disabled:opacity-50';

  if (image === null || cadrage === null) {
    return (
      <div className="flex flex-col items-center gap-3 py-5 text-center">
        <p className="text-discret text-sm">Une image de ton ordinateur ou d'Internet, recadrée en carré.</p>
        <button type="button" onClick={() => void choisir()} className={`${bouton} bg-accent/20 hover:bg-accent/35`}>
          <ImagePlus className="size-4" aria-hidden="true" />
          Choisir une image
        </button>
        <form
          className="flex w-full items-center gap-1"
          onSubmit={(evenement) => {
            evenement.preventDefault();
            void telecharger();
          }}
        >
          <input
            value={adresse}
            onChange={(evenement) => definirAdresse(evenement.target.value)}
            placeholder="ou l'adresse d'une image : https://…"
            aria-label="Adresse d'une image"
            spellCheck={false}
            className="bg-texte/10 focus:bg-texte/15 placeholder:text-discret h-8 min-w-0 flex-1 rounded px-2 text-sm outline-0"
          />
          <button type="submit" disabled={telechargement || adresse.trim() === ''} className={bouton}>
            <Download className="size-4" aria-hidden="true" />
            {telechargement ? 'Téléchargement…' : 'Charger'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-col items-center gap-2">
      <canvas
        ref={apercu}
        width={tailleDeLApercu}
        height={tailleDeLApercu}
        aria-label="Aperçu de l'icône : glisser pour déplacer, molette pour zoomer"
        onPointerDown={surAppui}
        onPointerMove={surMouvement}
        onPointerUp={() => (glisse.current = null)}
        onWheel={(evenement) => recadrer(zoomer(cadrage, evenement.deltaY < 0 ? 1.1 : 1 / 1.1, image.width, image.height))}
        className={`cursor-grab touch-none rounded-md active:cursor-grabbing ${masque === null ? '' : 'damier'}`}
        style={{ width: tailleDeLApercu, height: tailleDeLApercu }}
      />
      <label className="flex w-56 items-center gap-2 text-xs">
        <span className="text-discret">Zoom</span>
        <input
          type="range"
          min={1}
          max={4}
          step={0.05}
          value={cadrage.zoom}
          onChange={(evenement) => recadrer(zoomer(cadrage, Number(evenement.target.value) / cadrage.zoom, image.width, image.height))}
          className="accent-accent flex-1"
        />
      </label>
      <div className="flex w-full items-center justify-between gap-1 pt-1">
        <button type="button" onClick={() => void choisir()} className={bouton}>
          <ImagePlus className="size-4" aria-hidden="true" />
          Autre image
        </button>
        {masque === null ? (
          <button type="button" disabled={detourage === 'en-cours'} onClick={() => void retirerLeFond()} className={bouton}>
            <Eraser className="size-4" aria-hidden="true" />
            {detourage === 'en-cours' ? 'Détourage…' : 'Retirer le fond'}
          </button>
        ) : (
          <button type="button" onClick={() => definirMasque(null)} className={bouton}>
            <Undo2 className="size-4" aria-hidden="true" />
            Garder le fond
          </button>
        )}
        <button type="button" disabled={enCours || detourage === 'en-cours'} onClick={() => void valider()} className={`${bouton} bg-accent/20 hover:bg-accent/35`}>
          <Check className="size-4" aria-hidden="true" />
          Valider
        </button>
      </div>
    </div>
  );
}
