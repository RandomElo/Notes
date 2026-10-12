import { LocalFsError, RemoteFsError, VaultError } from '@notes/core';
import { describe, expect, it } from 'vitest';
import { messageDErreur, messageDuResultat, messageHorsReseau } from './writes';

describe('messages des modifications', () => {
  it('ne dit rien quand l’écriture est passée', () => {
    expect(messageDuResultat({ ok: true, ecrit: true, texte: '' })).toBeNull();
  });

  it('nomme l’appareil qui tient la page', () => {
    expect(messageDuResultat({ ok: false, raison: 'verrou', nom: 'pc-fixe' })).toContain('« pc-fixe »');
    expect(messageDuResultat({ ok: false, raison: 'verrou', nom: '' })).toContain('Un autre appareil');
  });

  it('explique une page changée ou disparue', () => {
    expect(messageDuResultat({ ok: false, raison: 'changee', texte: '' })).toContain('recommence');
    expect(messageDuResultat({ ok: false, raison: 'introuvable' })).toContain('plus sur le NAS');
  });

  it('ramène les erreurs au NAS injoignable sauf refus explicite', () => {
    expect(messageDErreur(new RemoteFsError('injoignable', 'x'))).toBe(messageHorsReseau);
    expect(messageDErreur(new Error('x'))).toBe(messageHorsReseau);
    expect(messageDErreur(new RemoteFsError('acces_refuse', 'Accès refusé.'))).toContain('Accès refusé.');
    expect(messageDErreur(new VaultError('titre_invalide', 'Titre vide.'))).toBe('Titre vide.');
    expect(messageDErreur(new LocalFsError('interne', 'plein'))).toContain('plein');
  });
});
