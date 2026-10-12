import { describe, expect, it } from 'vitest';
import { avecPageRecente, cleDuCache, lireReglagesDuTelephone, nombreDeRecentes, reglagesVides } from './phone-settings';

describe('réglages du téléphone', () => {
  it('relit ce qui a été écrit', () => {
    const reglages = { nas: { hote: '192.0.2.10', partage: 'partage', utilisateur: 'utilisateur', dossierVault: 'notes' }, hoteTailscale: '100.64.0.1', recentes: ['a'], derniereSync: 12, appareil: '0199a0b0-0000-7000-8000-00000000000a' };
    expect(lireReglagesDuTelephone(JSON.stringify(reglages))).toEqual(reglages);
  });

  it('remplace ce qui est abîmé par le défaut', () => {
    expect(lireReglagesDuTelephone('{pas du json')).toEqual(reglagesVides);
    expect(lireReglagesDuTelephone(JSON.stringify({ nas: { hote: 'a/b' }, hoteTailscale: 'a/b', recentes: 'x', derniereSync: 'hier' }))).toEqual(reglagesVides);
  });

  it('met la page ouverte en tête des récentes, sans doublon ni débordement', () => {
    let reglages = reglagesVides;
    for (let i = 0; i < nombreDeRecentes + 3; i++) {
      reglages = avecPageRecente(reglages, `p${i}`);
    }
    reglages = avecPageRecente(reglages, 'p5');
    expect(reglages.recentes[0]).toBe('p5');
    expect(reglages.recentes).toHaveLength(nombreDeRecentes);
    expect(new Set(reglages.recentes).size).toBe(nombreDeRecentes);
  });

  it('change de clé de cache avec le dossier, pas avec la casse du nom d’hôte', () => {
    const nas = { hote: 'NAS', partage: 'partage', utilisateur: 'utilisateur', dossierVault: '' };
    expect(cleDuCache(nas)).toBe(cleDuCache({ ...nas, hote: 'nas', utilisateur: 'autre' }));
    expect(cleDuCache(nas)).not.toBe(cleDuCache({ ...nas, dossierVault: 'notes' }));
  });
});

describe('identité du téléphone', () => {
  it('garde un identifiant valide, écarte le reste', () => {
    expect(lireReglagesDuTelephone(JSON.stringify({ appareil: '0199a0b0-0000-7000-8000-000000000001' })).appareil).toBe('0199a0b0-0000-7000-8000-000000000001');
    expect(lireReglagesDuTelephone(JSON.stringify({ appareil: '../x' })).appareil).toBeNull();
    expect(lireReglagesDuTelephone(JSON.stringify({ appareil: 12 })).appareil).toBeNull();
  });
});
