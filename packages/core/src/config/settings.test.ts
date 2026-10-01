import { describe, expect, it } from 'vitest';
import { lireReglages, validerReglagesNas } from './settings';

const valide = { hote: '192.0.2.10', partage: 'partage', utilisateur: 'utilisateur', dossierVault: 'Notes' };

describe('validerReglagesNas', () => {
  it('accepte des réglages corrects et retire les espaces autour', () => {
    const resultat = validerReglagesNas({ ...valide, hote: '  nas.local ', dossierVault: '' });
    expect(resultat).toEqual({ ok: true, valeur: { ...valide, hote: 'nas.local', dossierVault: '' } });
  });

  it.each(['', '\\\\nas', 'nas/partage', 'nas partage', '-nas', 'smb://nas'])('refuse l\'hôte %j', (hote) => {
    const resultat = validerReglagesNas({ ...valide, hote });
    expect(resultat.ok).toBe(false);
    expect(!resultat.ok && resultat.erreurs.hote).toBeTruthy();
  });

  it('refuse un partage avec séparateur et un dossier qui sort du partage', () => {
    const resultat = validerReglagesNas({ ...valide, partage: 'a/b', dossierVault: '../ailleurs' });
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) {
      expect(Object.keys(resultat.erreurs).sort()).toEqual(['dossierVault', 'partage']);
    }
  });

  it('refuse ce qui n\'est pas un objet ou a des champs du mauvais type', () => {
    expect(validerReglagesNas(null).ok).toBe(false);
    expect(validerReglagesNas('texte').ok).toBe(false);
    expect(validerReglagesNas({ ...valide, utilisateur: 42 }).ok).toBe(false);
  });

  it('ne garde aucun champ inconnu, en particulier pas de mot de passe', () => {
    const resultat = validerReglagesNas({ ...valide, motDePasse: 'secret' });
    expect(resultat.ok && Object.keys(resultat.valeur).sort()).toEqual([
      'dossierVault', 'hote', 'partage', 'utilisateur',
    ]);
  });
});

describe('lireReglages', () => {
  it('revient au défaut sur un contenu abîmé', () => {
    expect(lireReglages(undefined)).toEqual({ nas: null, vaultLocal: null });
    expect(lireReglages({ nas: { hote: '' }, vaultLocal: 'relatif/chemin' })).toEqual({ nas: null, vaultLocal: null });
  });

  it('garde des réglages valides', () => {
    expect(lireReglages({ nas: valide, vaultLocal: '/home/eloi/Notes' })).toEqual({ nas: valide, vaultLocal: '/home/eloi/Notes' });
  });
});
