import { dateDuNom, titreDuMemo } from '@notes/core';

/** Titre d'un mémo d'après son nom, comme sa future sous-page sur le PC : « Mémo du 11 octobre 2026 à 9 h 15 ». */
export function libelleDuMemo(nom: string): string {
  const date = dateDuNom(nom);
  return date === null ? nom : titreDuMemo(date);
}

/** Durée d'un enregistrement : « 0:07 », « 12:30 », « 1:02:05 ». */
export function dureeLisible(millisecondes: number): string {
  const total = Math.max(0, Math.floor(millisecondes / 1000));
  const heures = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secondes = String(total % 60).padStart(2, '0');
  return heures > 0 ? `${heures}:${String(minutes).padStart(2, '0')}:${secondes}` : `${minutes}:${secondes}`;
}

/** Taille d'un fichier, en Ko ou en Mo. */
export function tailleLisible(octets: number): string {
  if (octets < 1024 * 1024) {
    return `${Math.max(1, Math.round(octets / 1024))} Ko`;
  }
  return `${(octets / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
}

/** En-tête de la liste des mémos pas encore envoyés. */
export function titreDeLAttente(nombre: number): string {
  return nombre === 1 ? '1 mémo pas encore envoyé' : `${nombre} mémos pas encore envoyés`;
}
