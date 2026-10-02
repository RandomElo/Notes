import { describe, expect, it } from 'vitest';
import { poserVariables } from './apply-theme';

function fausseCible() {
  const proprietes = new Map<string, string>();
  return {
    proprietes,
    style: {
      setProperty: (nom: string, valeur: string) => void proprietes.set(nom, valeur),
      removeProperty: (nom: string) => void proprietes.delete(nom),
    },
  };
}

describe('poserVariables', () => {
  it('pose les variables, puis retire celles qui ont disparu la fois suivante', () => {
    const cible = fausseCible();
    const posees = poserVariables(cible, { '--color-accent': '#ff0000', '--color-fond': '#000' });
    expect(Object.fromEntries(cible.proprietes)).toEqual({ '--color-accent': '#ff0000', '--color-fond': '#000' });

    const suivantes = poserVariables(cible, { '--color-accent': '#00ff00' }, posees);
    expect(Object.fromEntries(cible.proprietes)).toEqual({ '--color-accent': '#00ff00' });
    expect(suivantes).toEqual(['--color-accent']);
  });
});
