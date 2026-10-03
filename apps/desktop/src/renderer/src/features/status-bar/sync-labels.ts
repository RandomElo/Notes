import type { SyncStatus } from '../../../../shared/ipc-contract';

/** « à 14:32 » aujourd'hui, sinon « hier à 14:32 » ou « le 2 octobre à 14:32 ». */
export function momentDeSync(instant: number, maintenant: number): string {
  const date = new Date(instant);
  const heure = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const jour = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const ecartEnJours = Math.round((jour(new Date(maintenant)) - jour(date)) / 86_400_000);
  if (ecartEnJours === 0) {
    return `à ${heure}`;
  }
  if (ecartEnJours === 1) {
    return `hier à ${heure}`;
  }
  return `le ${date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} à ${heure}`;
}

/** Texte de la barre de statut : l'état, et l'heure de la dernière sync quand elle compte. */
export function libelleDeSync(etat: SyncStatus, maintenant: number): string {
  if (etat.etat === 'synchronise' && etat.derniereSync !== null) {
    return `Synchronisé ${momentDeSync(etat.derniereSync, maintenant)}`;
  }
  if (etat.etat === 'injoignable' && etat.derniereSync !== null) {
    return `${etat.message}, dernière synchronisation ${momentDeSync(etat.derniereSync, maintenant)}`;
  }
  return etat.message;
}
