import { describe, expect, it } from 'vitest';
import { deciderPaire, effacerLaPaire } from './auto-pairs';

describe('fermeture automatique', () => {
  it('ferme une parenthèse et des guillemets français avec une espace dedans', () => {
    expect(deciderPaire('(', ' ', '', false)).toEqual({ genre: 'paire', ouvrant: '(', fermant: ')', espace: ' ' });
    expect(deciderPaire('«', ' ', '', false)).toEqual({ genre: 'paire', ouvrant: '«', fermant: '»', espace: ' ' });
  });

  it('ferme crochets, accolades, guillemets droits et apostrophes avec une espace dedans', () => {
    for (const [ouvrant, fermant] of [['[', ']'], ['{', '}'], ['"', '"'], ["'", "'"]]) {
      expect(deciderPaire(ouvrant!, ' ', '', false)).toEqual({ genre: 'paire', ouvrant, fermant, espace: ' ' });
    }
  });

  it('garde le crochet collé en début de ligne et après un marqueur de liste, pour les cases à cocher', () => {
    expect(deciderPaire('[', '', '', false)).toEqual({ genre: 'paire', ouvrant: '[', fermant: ']', espace: '' });
    expect(deciderPaire('[', '- ', '', false)).toEqual({ genre: 'paire', ouvrant: '[', fermant: ']', espace: '' });
    expect(deciderPaire('[', 'a ', '', false)).toEqual({ genre: 'paire', ouvrant: '[', fermant: ']', espace: ' ' });
  });

  it('pas d’espace dans le code', () => {
    expect(deciderPaire('(', 'f', '', false, true)).toEqual({ genre: 'paire', ouvrant: '(', fermant: ')', espace: '' });
  });

  it('ne touche pas à l’apostrophe, à l’accent grave ni à l’astérisque', () => {
    expect(deciderPaire("'", 'l', 'a', false)).toBeNull();
    expect(deciderPaire("'", 'l', '', false)).toBeNull();
    expect(deciderPaire('`', ' ', '', false)).toBeNull();
    expect(deciderPaire('*', ' ', '', false)).toBeNull();
  });

  it('ne ferme pas devant un mot, ni un guillemet collé à un mot', () => {
    expect(deciderPaire('(', ' ', 'mot', false)).toBeNull();
    expect(deciderPaire('"', 'mot', '', false)).toBeNull();
  });

  it('saute le fermant déjà là, espace intérieure comprise', () => {
    expect(deciderPaire(')', 'x', ')', false)).toEqual({ genre: 'sauter', longueur: 1 });
    expect(deciderPaire(')', 'x', ' )', false)).toEqual({ genre: 'sauter', longueur: 2 });
    expect(deciderPaire('»', 'x', ' »', false)).toEqual({ genre: 'sauter', longueur: 2 });
    expect(deciderPaire(')', 'x', '', false)).toBeNull();
  });

  it('entoure une sélection', () => {
    expect(deciderPaire('(', 'a', 'mot', true)).toEqual({ genre: 'paire', ouvrant: '(', fermant: ')', espace: ' ' });
  });

  it('efface une paire vide, avec ses espaces', () => {
    expect(effacerLaPaire('x( ', ' )')).toEqual({ avant: 2, apres: 2 });
    expect(effacerLaPaire('(', ')')).toEqual({ avant: 1, apres: 1 });
    expect(effacerLaPaire('« ', ' »')).toEqual({ avant: 2, apres: 2 });
    expect(effacerLaPaire('(', 'x')).toBeNull();
    expect(effacerLaPaire('', ')')).toBeNull();
  });
});
