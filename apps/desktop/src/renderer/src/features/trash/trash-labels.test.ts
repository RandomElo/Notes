import { describe, expect, it } from 'vitest';
import { dateDeSuppression, delaiAvantEffacement, emplacementDOrigine, typeDImage } from './trash-labels';

const maintenant = new Date(2026, 9, 4, 22, 30).getTime();
const iso = (annee: number, mois: number, jour: number, h: number, m: number) => new Date(annee, mois, jour, h, m).toISOString();

describe('textes de la corbeille', () => {
  it('dit quand une entrée a été supprimée', () => {
    expect(dateDeSuppression(iso(2026, 9, 4, 22, 5), maintenant)).toBe("aujourd'hui à 22:05");
    expect(dateDeSuppression(iso(2026, 9, 3, 10, 12), maintenant)).toBe('hier à 10:12');
    expect(dateDeSuppression(iso(2026, 9, 2, 10, 12), maintenant)).toBe('le 2 octobre à 10:12');
    expect(dateDeSuppression(iso(2025, 11, 31, 9, 0), maintenant)).toBe('le 31 décembre 2025 à 09:00');
    expect(dateDeSuppression('pas une date', maintenant)).toBe('');
  });

  it('dit dans combien de temps elle sera effacée', () => {
    expect(delaiAvantEffacement(iso(2026, 9, 4, 22, 5), maintenant)).toBe('Effacée dans 30 jours');
    expect(delaiAvantEffacement(iso(2026, 8, 5, 22, 0), maintenant)).toBe('Effacée demain');
    expect(delaiAvantEffacement(iso(2026, 7, 1, 0, 0), maintenant)).toBe('Effacée au prochain démarrage');
  });

  it('montre l’emplacement d’origine et la nature d’une image', () => {
    expect(emplacementDOrigine('Projets/Refonte')).toBe('dans Projets');
    expect(emplacementDOrigine('Refonte')).toBe('à la racine');
    expect(emplacementDOrigine('Projets/Refonte/assets/schema.png')).toBe('dans Projets / Refonte');
    expect(typeDImage('schema.PNG')).toBe('image/png');
    expect(typeDImage('sans-extension')).toBe('application/octet-stream');
  });
});
