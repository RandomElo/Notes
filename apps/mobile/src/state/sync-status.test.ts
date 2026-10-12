import { describe, expect, it } from 'vitest';
import { libelleDeLEtat, momentLisible } from './sync-status';

const maintenant = new Date(2026, 9, 10, 14, 30).getTime();

describe('momentLisible', () => {
  it('donne l’heure seule pour aujourd’hui', () => {
    expect(momentLisible(new Date(2026, 9, 10, 9, 5).getTime(), maintenant)).toBe('09:05');
  });

  it('dit hier, puis la date', () => {
    expect(momentLisible(new Date(2026, 9, 9, 18, 30).getTime(), maintenant)).toBe('hier à 18:30');
    expect(momentLisible(new Date(2026, 9, 3, 18, 30).getTime(), maintenant)).toBe('le 3 octobre à 18:30');
  });
});

describe('libelleDeLEtat', () => {
  it('montre la dernière sync quand le NAS ne répond pas', () => {
    const derniere = new Date(2026, 9, 9, 18, 30).getTime();
    expect(libelleDeLEtat({ genre: 'injoignable', depuis: maintenant, horsReseau: false }, derniere, maintenant)).toBe('NAS injoignable, synchronisé hier à 18:30');
    expect(libelleDeLEtat({ genre: 'injoignable', depuis: maintenant, horsReseau: true }, null, maintenant)).toBe('Pas de réseau, jamais synchronisé');
    expect(libelleDeLEtat({ genre: 'injoignable', depuis: maintenant, horsReseau: false }, derniere, maintenant, true)).toBe(
      'NAS injoignable, même par Tailscale : est-il activé ? Synchronisé hier à 18:30',
    );
    expect(libelleDeLEtat({ genre: 'injoignable', depuis: maintenant, horsReseau: true }, null, maintenant, true)).toBe('Pas de réseau, jamais synchronisé');
  });

  it('dit « à l’instant » juste après une sync, l’heure ensuite', () => {
    expect(libelleDeLEtat({ genre: 'a-jour' }, maintenant - 5_000, maintenant)).toBe("NAS joignable, synchronisé à l'instant");
    expect(libelleDeLEtat({ genre: 'a-jour' }, new Date(2026, 9, 10, 9, 5).getTime(), maintenant)).toBe('NAS joignable, synchronisé à 09:05');
  });

  it('compte les fichiers du premier téléchargement', () => {
    expect(libelleDeLEtat({ genre: 'synchro', faits: 3, total: 40 }, null, maintenant)).toBe('Téléchargement, 3 sur 40');
    expect(libelleDeLEtat({ genre: 'synchro', faits: 0, total: 0 }, null, maintenant)).toBe('Synchronisation…');
  });
});
