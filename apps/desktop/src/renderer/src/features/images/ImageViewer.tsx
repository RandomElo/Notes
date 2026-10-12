import type { ImageAttributes } from '@notes/document';
import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';

interface ImageViewerProps {
  attributs: ImageAttributes;
  /** Adresse à charger (protocole des images du main). */
  adresse: string;
  surFermeture: () => void;
}

/** Visionneuse plein écran (docs/spec/editeur.md) : l'image entière sur fond sombre. Échap, le bouton ou un clic à côté la ferment. */
export function ImageViewer({ attributs, adresse, surFermeture }: ImageViewerProps) {
  const fenetre = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const avant = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    fenetre.current?.focus();
    return () => avant?.focus();
  }, []);

  return (
    <div
      ref={fenetre}
      role="dialog"
      aria-modal="true"
      aria-label={attributs.alt === '' ? 'Image' : attributs.alt}
      tabIndex={-1}
      onKeyDown={(evenement) => {
        if (evenement.key === 'Escape') {
          evenement.preventDefault();
          evenement.stopPropagation();
          surFermeture();
        }
      }}
      onClick={(evenement) => {
        if (evenement.target === evenement.currentTarget) {
          surFermeture();
        }
      }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/85 p-8 outline-0"
    >
      <button type="button" onClick={surFermeture} aria-label="Fermer" title="Fermer (Échap)" className="absolute top-3 right-3 rounded p-1.5 text-white/80 hover:bg-white/15">
        <X className="size-5" aria-hidden="true" />
      </button>
      <img src={adresse} alt={attributs.alt} className="max-h-[calc(100%-4rem)] max-w-full object-contain" />
      {/* La légende en bas de l'écran, loin de l'image : elle ne la cache pas et ne bouge pas avec sa taille. */}
      {attributs.title !== null && attributs.title !== '' && (
        <p className="absolute inset-x-8 bottom-4 text-center text-sm text-white/80">{attributs.title}</p>
      )}
    </div>
  );
}
