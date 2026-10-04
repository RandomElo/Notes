import { describe, expect, it } from 'vitest';
import { exporterMarkdown, mentionDImage } from './markdown';

const id = '0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const titres: Record<string, string> = { [id]: 'Projets' };
const options = { titreDePage: (cle: string) => titres[cle] ?? null };

describe('exporterMarkdown', () => {
  it('garde à l’octet près les blocs que l’export ne touche pas', () => {
    const corps = 'Titre\n=====\n\n* une puce\n* autre\n\nTexte avec __gras__.\n';
    expect(exporterMarkdown(corps, options)).toBe(corps);
  });

  it('écrit une mention de page en texte simple, avec le titre du moment', () => {
    expect(exporterMarkdown(`Voir [Ancien titre](notes://${id}) et la suite.\n`, options)).toBe('Voir Projets et la suite.\n');
  });

  it('garde le texte du fichier pour une mention cassée', () => {
    expect(exporterMarkdown('Voir [Disparue](notes://0199a1b2-c3d4-7e5f-8a9b-000000000000).\n', options)).toBe('Voir Disparue.\n');
  });

  it('réduit un lien interne mis en forme à son texte', () => {
    expect(exporterMarkdown(`Voir [*ici*](notes://${id}).\n`, options)).toBe('Voir *ici*.\n');
  });

  it('ramène une mention de site à un lien ordinaire, et laisse les autres liens', () => {
    const corps = 'Le [Site](https://exemple.fr "mention") et [doc](https://exemple.fr/doc "Aide").\n';
    expect(exporterMarkdown(corps, options)).toBe('Le [Site](https://exemple.fr) et [doc](https://exemple.fr/doc "Aide").\n');
  });

  it('écrit un callout en paragraphes simples, son icône devant le premier, jamais en citation', () => {
    const corps = 'Avant.\n\n```notes-callout\ntype: warning\ntext: |-\n  Couper le **wifi** avant.\n\n  Deuxième paragraphe.\n```\n\nAprès.\n';
    const sortie = exporterMarkdown(corps, options);
    expect(sortie).toBe('Avant.\n\n⚠️ Couper le **wifi** avant.\n\nDeuxième paragraphe.\n\nAprès.\n');
    expect(sortie).not.toContain('>');
  });

  it('prend l’icône choisie pour un callout', () => {
    expect(exporterMarkdown('```notes-callout\nicon: 🚀\ntext: Décollage.\n```\n', options)).toBe('🚀 Décollage.\n');
  });

  it('remplace une image par une mention textuelle', () => {
    const corps = 'Avant.\n\n![Schéma du réseau](assets/reseau.webp#largeur=66 "Le salon")\n\nAprès.\n';
    expect(exporterMarkdown(corps, options)).toBe('Avant.\n\n*Image : Schéma du réseau, Le salon*\n\nAprès.\n');
  });

  it('écrit une image vers l’adresse fournie, sans ses réglages', () => {
    const corps = '![Schéma](assets/reseau.webp#largeur=66&align=gauche "Le salon")\n';
    const sortie = exporterMarkdown(corps, { ...options, adresseDImage: (src) => (src === 'assets/reseau.webp' ? src : null) });
    expect(sortie).toBe('![Schéma](assets/reseau.webp "Le salon")\n');
  });

  it('remet le front-matter en tête à la demande', () => {
    expect(exporterMarkdown('Texte.\n', { ...options, enTete: 'id: x\ntitle: Projets' })).toBe('---\nid: x\ntitle: Projets\n---\n\nTexte.\n');
  });

  it('touche aussi les mentions des listes et des tableaux', () => {
    const corps = `- [x](notes://${id})\n\n| A |\n| - |\n| [y](notes://${id}) |\n`;
    const sortie = exporterMarkdown(corps, options);
    expect(sortie).toContain('- Projets');
    expect(sortie).toMatch(/\| Projets \|/);
    expect(sortie).not.toContain('notes://');
  });
});

describe('mentionDImage', () => {
  it('prend le nom du fichier sans description', () => {
    expect(mentionDImage({ src: 'assets/capture%20%C3%A9cran.webp', alt: '', title: null })).toBe('Image : capture écran.webp');
  });
});

