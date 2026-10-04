import { describe, expect, it } from 'vitest';
import { PendingRequest, demandeLaRecherche } from './search-request';

describe('demandeLaRecherche', () => {
  it('ne réagit qu’à l’argument exact', () => {
    expect(demandeLaRecherche(['/opt/Notes.AppImage', '--recherche'])).toBe(true);
    expect(demandeLaRecherche(['/opt/Notes.AppImage'])).toBe(false);
    expect(demandeLaRecherche(['/opt/Notes.AppImage', '--recherche=x', 'recherche'])).toBe(false);
  });
});

describe('PendingRequest', () => {
  it('garde la demande jusqu’à ce que le renderer la prenne, une seule fois', () => {
    let avis = 0;
    const demandes = new PendingRequest<string>(() => avis++);
    expect(demandes.prendre()).toBeNull();
    demandes.demander('a');
    demandes.demander('b');
    expect(avis).toBe(2);
    expect(demandes.prendre()).toBe('b');
    expect(demandes.prendre()).toBeNull();
  });
});
