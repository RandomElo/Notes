import { describe, expect, it } from 'vitest';
import { assemblerPage, decouperPage, lireChampsExistants, lireMeta, modifierEnTete } from './front-matter';

const id = '0199a0b0-1234-7abc-8def-0123456789ab';
const enTeteComplet = `id: ${id}\ntitle: Refonte du NAS\nicon: 🗄️\ncreated: 2026-10-01T10:00:00.000Z\nupdated: 2026-10-01T11:00:00.000Z`;

describe('decouperPage et assemblerPage', () => {
  // Règle 2 du projet : relire puis réécrire sans rien changer ne modifie pas un octet.
  it.each([
    `---\n${enTeteComplet}\n---\n# Titre\n\nTexte.\n`,
    `---\n${enTeteComplet}\n---\n`,
    `---\n${enTeteComplet}\n---`,
    `---\r\n${enTeteComplet.replaceAll('\n', '\r\n')}\r\n---\r\nTexte\r\n`,
    `\uFEFF---\n${enTeteComplet}\n---\nTexte`,
    '---\n---\ncorps après un front-matter vide\n',
    '# Pas de front-matter\n\n---\n\nUn séparateur dans le corps.\n',
    '--- pas un front-matter\ntexte\n',
    '---\nfront-matter jamais fermé\n',
    '',
    `---\n${enTeteComplet}\n---\n---\nle corps commence par un séparateur\n---\n`,
  ])('redonne exactement %j', (texte) => {
    expect(assemblerPage(decouperPage(texte))).toBe(texte);
  });

  it('sépare le bloc YAML du corps', () => {
    const morceaux = decouperPage(`---\n${enTeteComplet}\n---\n# Titre\n`);
    expect(morceaux.enTete).toBe(enTeteComplet);
    expect(morceaux.corps).toBe('# Titre\n');
  });

  it("ne prend pas un séparateur du corps pour un front-matter", () => {
    expect(decouperPage('Texte\n---\nSuite\n').enTete).toBeNull();
  });
});

describe('lireMeta', () => {
  it('lit un front-matter complet', () => {
    expect(lireMeta(`${enTeteComplet}\nmode: todo`)).toEqual({
      id,
      titre: 'Refonte du NAS',
      icone: '🗄️',
      creeLe: '2026-10-01T10:00:00.000Z',
      modifieLe: '2026-10-01T11:00:00.000Z',
      mode: 'todo',
    });
  });

  it.each([
    null,
    '',
    'title: Sans identifiant',
    `id: ${id}`,
    `id: pas-un-uuid\ntitle: X`,
    `id: ${id}\ntitle: ""`,
    'juste du texte',
    '- une\n- liste',
    'cle: [non fermé',
  ])('rend null pour %j', (enTete) => {
    expect(lireMeta(enTete)).toBeNull();
  });

  // Écrits à la main ou par un autre outil, ces titres ne sont pas entre guillemets.
  it.each(['2026', '3.14', 'oui', 'true', 'null', '2026-10-01', '~'])('garde le titre %j tel quel, sans le prendre pour autre chose', (titre) => {
    expect(lireMeta(`id: ${id}\ntitle: ${titre}`)?.titre).toBe(titre);
  });

  it('ignore un mode inconnu et une icône absente', () => {
    expect(lireMeta(`id: ${id}\ntitle: X\nmode: kanban`)).toMatchObject({ mode: null, icone: null, creeLe: '' });
  });
});

describe('modifierEnTete', () => {
  it('ne touche qu’aux clés demandées et garde commentaires, clés inconnues et ordre', () => {
    const origine = `# note personnelle\nid: ${id}\ntitle: Ancien\ntheme_overrides:\n  accent: "#ff0000"\ntags: [a, b]\nupdated: 2026-01-01T00:00:00.000Z`;
    const resultat = modifierEnTete(origine, { titre: 'Nouveau', modifieLe: '2026-10-01T12:00:00.000Z' });
    expect(resultat).toBe(
      `# note personnelle\nid: ${id}\ntitle: Nouveau\ntheme_overrides:\n  accent: "#ff0000"\ntags: [a, b]\nupdated: 2026-10-01T12:00:00.000Z`,
    );
  });

  it('crée un front-matter relisible à partir de rien', () => {
    const cree = modifierEnTete(null, { id, titre: 'Titre : avec deux-points', creeLe: 'a', modifieLe: 'b' });
    expect(lireMeta(cree)).toMatchObject({ id, titre: 'Titre : avec deux-points' });
  });

  it('retire une clé quand la valeur est null', () => {
    const resultat = modifierEnTete(`id: ${id}\ntitle: X\nmode: todo`, { mode: null });
    expect(resultat).toBe(`id: ${id}\ntitle: X`);
  });

  it('remplace un front-matter qui n’est pas une liste de clés', () => {
    expect(lireMeta(modifierEnTete('- a\n- b', { id, titre: 'X' }))).toMatchObject({ id, titre: 'X' });
  });

  it.each(['Titre "entre guillemets"', "L'apostrophe", '# dièse', '- tiret', 'oui', '2026', '@mention', 'a: b: c'])(
    'conserve le titre %j à la relecture',
    (titre) => {
      expect(lireMeta(modifierEnTete(null, { id, titre }))?.titre).toBe(titre);
    },
  );
});

describe('lireChampsExistants', () => {
  it('récupère titre et date de création d’un front-matter incomplet', () => {
    expect(lireChampsExistants('title: Venu d’Obsidian\ncreated: 2024-05-01')).toEqual({
      titre: 'Venu d’Obsidian',
      creeLe: '2024-05-01',
    });
    expect(lireChampsExistants(null)).toEqual({ titre: null, creeLe: null });
    expect(lireChampsExistants('[cassé')).toEqual({ titre: null, creeLe: null });
  });
});
