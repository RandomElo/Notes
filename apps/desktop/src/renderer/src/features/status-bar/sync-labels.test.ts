import { describe, expect, it } from 'vitest';
import type { SyncStatus } from '../../../../shared/ipc-contract';
import { momentDeSync, libelleDeSync } from './sync-labels';

const maintenant = new Date(2026, 9, 3, 15, 0).getTime();
const base: SyncStatus = { etat: 'synchronise', message: 'Synchronisé', derniereSync: new Date(2026, 9, 3, 14, 32).getTime(), injoignableDepuis: null, sauvegardes: [], erreurs: [], refuses: [] };

describe('libellés de la sync', () => {
  it('donne l’heure, ou le jour quand ce n’est pas aujourd’hui', () => {
    expect(momentDeSync(new Date(2026, 9, 3, 9, 5).getTime(), maintenant)).toBe('à 09:05');
    expect(momentDeSync(new Date(2026, 9, 2, 22, 10).getTime(), maintenant)).toBe('hier à 22:10');
    expect(momentDeSync(new Date(2026, 8, 28, 8, 0).getTime(), maintenant)).toBe('le 28 septembre à 08:00');
  });

  it('dit quand a eu lieu la dernière synchronisation', () => {
    expect(libelleDeSync(base, maintenant)).toBe('Synchronisé à 14:32');
    expect(libelleDeSync({ ...base, etat: 'injoignable', message: 'NAS injoignable', injoignableDepuis: new Date(2026, 9, 3, 19, 2).getTime() }, maintenant)).toBe('NAS injoignable depuis 19:02');
    expect(libelleDeSync({ ...base, etat: 'injoignable', message: 'NAS injoignable', injoignableDepuis: new Date(2026, 9, 2, 19, 2).getTime() }, maintenant)).toBe('NAS injoignable depuis hier à 19:02');
    expect(libelleDeSync({ ...base, etat: 'injoignable', message: 'Accès refusé par le NAS', injoignableDepuis: maintenant }, maintenant)).toBe('Accès refusé par le NAS');
    expect(libelleDeSync({ ...base, etat: 'en_cours', message: 'Synchronisation en cours' }, maintenant)).toBe('Synchronisation en cours');
  });
});
