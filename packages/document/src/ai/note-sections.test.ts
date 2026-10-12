import { describe, expect, it } from 'vitest';
import { aDuTexte, assemblerSections, decouperEnSections, demandeDeSection, demandeDesTitres, mettreEnListes, reponseDeSection, sortieMaxDeSection, titresCorriges } from './note-sections';

describe('sections d’une page', () => {
  it('découpe à chaque titre, hors des blocs fencés, et se remonte', () => {
    const texte = 'Intro\n\n## Un\nligne\n```\n# pas un titre\n```\n\n### Deux\n\n# Trois\nfin\n';
    const sections = decouperEnSections(texte);
    expect(sections).toEqual([
      { titre: null, corps: 'Intro' },
      { titre: '## Un', corps: 'ligne\n```\n# pas un titre\n```' },
      { titre: '### Deux', corps: '' },
      { titre: '# Trois', corps: 'fin' },
    ]);
    expect(assemblerSections(sections)).toBe('Intro\n\n## Un\n\nligne\n```\n# pas un titre\n```\n\n### Deux\n\n# Trois\n\nfin');
  });

  it('dit si une section a du texte à retravailler', () => {
    expect(aDuTexte('[[BLOC-1]]\n\n[[BLOC-2]]')).toBe(false);
    expect(aDuTexte('Voir [[BLOC-1]]')).toBe(true);
  });

  it('donne le titre au modèle pour le contexte', () => {
    expect(demandeDeSection({ titre: '### Token', corps: '- un bout de mot' })).toBe('Titre de la section : Token\nNotes :\n- un bout de mot');
    expect(demandeDeSection({ titre: null, corps: 'Intro' })).toBe('Titre de la section : (début de la page)\nNotes :\nIntro');
  });
});

describe('mise en listes avant l’appel', () => {
  it('fait une puce de chaque ligne qui se suit, une ligne finie par « : » en tête', () => {
    expect(mettreEnListes('OpenClaw\nHermes agent')).toBe('- OpenClaw\n- Hermes agent');
    expect(mettreEnListes('Pour contourner :\nun contexte persistant\nla mémoire en Markdown')).toBe('Pour contourner :\n\n- un contexte persistant\n- la mémoire en Markdown');
    expect(mettreEnListes('Vu :\nA\nOutils :\nB')).toBe('Vu :\n\n- A\n\nOutils :\n\n- B');
  });

  it('laisse une ligne seule, une liste, une citation ou un repère', () => {
    expect(mettreEnListes('Une phrase seule.\n\nUne autre.')).toBe('Une phrase seule.\n\nUne autre.');
    expect(mettreEnListes('Intro\n- a\n- b')).toBe('Intro\n- a\n- b');
    expect(mettreEnListes('> cité\n> encore')).toBe('> cité\n> encore');
    expect(mettreEnListes('texte\n[[BLOC-1]]')).toBe('texte\n[[BLOC-1]]');
  });
});

describe('réponse du modèle pour une section', () => {
  it('garde une réponse sûre, sans titre ni préambule répétés', () => {
    expect(reponseDeSection('- OpenClaw\n- Hermes agent', 'Réponse :\n### Agents\n- OpenClaw\n- Hermes Agent', false)).toEqual({ texte: '- OpenClaw\n- Hermes Agent', gardee: false });
  });

  it('garde les notes quand la réponse est coupée, invente ou perd un repère', () => {
    const corps = 'Suite de';
    expect(reponseDeSection(corps, '- Suite de couches', true)).toEqual({ texte: corps, gardee: true });
    expect(reponseDeSection(corps, `- ${'Le MLP est un réseau. '.repeat(10)}`, false)).toEqual({ texte: corps, gardee: true });
    expect(reponseDeSection('Voir\n[[BLOC-1]]', 'Voir ceci.', false)).toEqual({ texte: 'Voir\n[[BLOC-1]]', gardee: true });
    expect(reponseDeSection(corps, '  ', false).gardee).toBe(true);
  });

  it('borne la réponse d’après la longueur des notes', () => {
    expect(sortieMaxDeSection('')).toBe(40);
    expect(sortieMaxDeSection('x'.repeat(230))).toBe(140);
  });
});

describe('fautes des titres', () => {
  const titres = ['### Apprentisages', '## Agent opérateur (navigateurs agentique)', '# Les bases', '## Pattern reAct'];

  it('envoie les titres numérotés, sans leurs dièses', () => {
    expect(demandeDesTitres(titres)).toBe('1. Apprentisages\n2. Agent opérateur (navigateurs agentique)\n3. Les bases\n4. Pattern reAct');
  });

  it('garde le niveau, prend la correction, laisse un titre réécrit ou absent', () => {
    const reponse = '1. Apprentissages\n2. Agent opérateur (navigateurs agentiques)\n3. Les fondamentaux de l’IA\n';
    expect(titresCorriges(titres, reponse)).toEqual(['### Apprentissages', '## Agent opérateur (navigateurs agentiques)', '# Les bases', '## Pattern reAct']);
  });
});
