import { icons } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * Les icônes Lucide par leur nom sans tirets ni majuscules, comme sur le
 * desktop. Toutes les icônes pèsent lourd : ce module n'est chargé qu'à la
 * première icône de page Lucide affichée (PageIcon), jamais au lancement.
 */
export const iconesParNom = new Map(Object.entries(icons as Record<string, LucideIcon>).map(([nom, composant]) => [nom.toLowerCase(), composant]));
