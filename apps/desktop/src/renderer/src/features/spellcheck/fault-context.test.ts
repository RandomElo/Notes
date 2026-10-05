import { describe, expect, it } from 'vitest';
import { contexteDeFaute } from './fault-context';

describe("phrase autour d'une faute", () => {
  it('garde la phrase du mot, sans les voisines', () => {
    const texte = 'Bonjour. Il fesait beau hier. Demain aussi.';
    const de = texte.indexOf('fesait');
    expect(contexteDeFaute(texte, de, de + 6)).toEqual({ avant: 'Il ', mot: 'fesait', apres: ' beau hier.', coupeAvant: true, coupeApres: true });
  });

  it("prend tout le bloc quand il n'a qu'une phrase", () => {
    expect(contexteDeFaute('Il fesait beau', 3, 9)).toEqual({ avant: 'Il ', mot: 'fesait', apres: ' beau', coupeAvant: false, coupeApres: false });
  });

  it("ne coupe pas sur un point au milieu d'un mot", () => {
    const texte = 'Voir le fichier index.ts qui fesait planter.';
    const de = texte.indexOf('fesait');
    expect(contexteDeFaute(texte, de, de + 6).avant).toBe('Voir le fichier index.ts qui ');
  });

  it('coupe une phrase très longue à un espace', () => {
    const texte = `${'mot '.repeat(50)}fesait${' suite'.repeat(40)}`;
    const de = texte.indexOf('fesait');
    const contexte = contexteDeFaute(texte, de, de + 6);
    expect(contexte.avant.length).toBeLessThanOrEqual(90);
    expect(contexte.avant.startsWith('mot ')).toBe(true);
    expect(contexte.apres.length).toBeLessThanOrEqual(90);
    expect(contexte.apres.endsWith('suite')).toBe(true);
    expect(contexte.coupeAvant && contexte.coupeApres).toBe(true);
  });
});
