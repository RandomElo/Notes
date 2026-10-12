import { natureDIcone } from '@notes/core';
import { icons } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { adresseDImage } from '../images/image-url';

/** Les icônes Lucide par leur nom sans tirets ni majuscules : `book-open`, `arrow-down-a-z` et `arrow-down-az` s'y retrouvent. */
const parNom = new Map(Object.entries(icons as Record<string, LucideIcon>).map(([nom, composant]) => [nom.toLowerCase(), composant]));

/** Le composant de l'icône Lucide écrite `book-open` dans le front-matter, ou null s'il n'existe pas. */
export function composantLucide(nom: string): LucideIcon | null {
  return parNom.get(nom.replace(/-/g, '').toLowerCase()) ?? null;
}

interface PageIconProps {
  /** Valeur brute de la clé `icon` du front-matter. */
  icone: string | null;
  /** Dossier de la page : une icône image est dans ses `assets/`. */
  chemin: string;
  /** Classes du conteneur : sa taille de police donne la taille de l'icône. */
  className?: string;
  /** Ce qui s'affiche sans icône, ou avec une icône qui n'en est pas une. */
  defaut?: ReactNode;
}

/**
 * Icône d'une page (docs/spec/editeur.md) : emoji, icône Lucide ou image de la page,
 * à la taille de la police du conteneur. Une valeur inconnue affiche le défaut :
 * rien de ce qui vient du fichier n'est interprété autrement.
 */
export function PageIcon({ icone, chemin, className = '', defaut = null }: PageIconProps) {
  const nature = natureDIcone(icone);
  const conteneur = `inline-flex shrink-0 items-center justify-center leading-none ${className}`;
  if (nature?.genre === 'emoji') {
    return (
      <span className={conteneur} aria-hidden="true">
        {nature.emoji}
      </span>
    );
  }
  if (nature?.genre === 'lucide') {
    const Icone = composantLucide(nature.nom);
    if (Icone !== null) {
      return (
        <span className={conteneur} aria-hidden="true">
          <Icone className="size-[1em]" />
        </span>
      );
    }
  }
  if (nature?.genre === 'image') {
    const adresse = adresseDImage(chemin, nature.src);
    if (adresse !== null) {
      return (
        <span className={conteneur} aria-hidden="true">
          <img src={adresse} alt="" draggable={false} className="size-[1em] rounded-[0.15em] object-cover" />
        </span>
      );
    }
  }
  return <>{defaut}</>;
}
