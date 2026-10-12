import { natureDIcone } from '@notes/core';
import { cheminDeLImage } from '@notes/ui/image-path';
import { FileText, ListChecks } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

/** Les icônes Lucide par leur nom, chargées une fois, à la première demande (lucide-by-name.ts). */
let parNom: ReadonlyMap<string, LucideIcon> | null = null;
let chargement: Promise<ReadonlyMap<string, LucideIcon>> | null = null;
function chargerLesIcones(): Promise<ReadonlyMap<string, LucideIcon>> {
  chargement ??= import('./lucide-by-name').then((module) => (parNom = module.iconesParNom));
  return chargement;
}

/** L'icône Lucide de ce nom, dès qu'elle est chargée ; undefined avant, ou si le nom est inconnu. */
function useIconeLucide(nom: string | null): LucideIcon | undefined {
  const [, definirCharge] = useState(parNom !== null);
  useEffect(() => {
    if (nom !== null && parNom === null) {
      void chargerLesIcones().then(() => definirCharge(true));
    }
  }, [nom]);
  return nom === null ? undefined : parNom?.get(nom.replace(/-/g, '').toLowerCase());
}

interface PageIconProps {
  /** Valeur brute de la clé `icon` du front-matter. */
  icone: string | null;
  /** Dossier de la page : une icône image est dans ses `assets/`. */
  chemin: string;
  /** Page en mode liste : sans icône, une case cochée plutôt qu'une feuille. */
  liste?: boolean;
  /** Adresse d'un fichier du vault (useCacheUrls). */
  adresse: (chemin: string) => string | null;
  className?: string;
}

/**
 * Icône d'une page (README §6) : emoji, icône Lucide ou image de la page, à la
 * taille de la police du conteneur. Rien de ce qui vient du fichier n'est
 * interprété autrement : une valeur inconnue montre l'icône par défaut.
 */
export function PageIcon({ icone, chemin, liste = false, adresse, className = '' }: PageIconProps) {
  const nature = natureDIcone(icone);
  const Lucide = useIconeLucide(nature?.genre === 'lucide' ? nature.nom : null);
  const conteneur = `inline-flex shrink-0 items-center justify-center leading-none ${className}`;
  if (nature?.genre === 'emoji') {
    return (
      <span className={conteneur} aria-hidden="true">
        {nature.emoji}
      </span>
    );
  }
  if (Lucide !== undefined) {
    return (
      <span className={conteneur} aria-hidden="true">
        <Lucide className="size-[1em]" />
      </span>
    );
  }
  if (nature?.genre === 'image') {
    const fichier = cheminDeLImage(chemin, nature.src);
    const url = fichier === null ? null : adresse(fichier);
    if (url !== null) {
      return (
        <span className={conteneur} aria-hidden="true">
          <img src={url} alt="" draggable={false} className="size-[1em] rounded-[0.15em] object-cover" />
        </span>
      );
    }
  }
  const Defaut = liste ? ListChecks : FileText;
  return (
    <span className={`${conteneur} text-discret`} aria-hidden="true">
      <Defaut className="size-[0.9em]" />
    </span>
  );
}
