import { describe, expect, it } from 'vitest';
import { lireMarkdown } from '../markdown/parse';
import { renommerMentions } from './rename-mentions';

const id = '0199a0b0-0000-7000-8000-000000000002';

describe('renommerMentions', () => {
  it('ne réécrit que les blocs qui mentionnent la page', () => {
    const corps = `Intro  _gardée_ telle quelle.\n\nVoir [Projets](notes://${id}) ici.\n\n* une puce\n`;
    expect(renommerMentions(corps, id, 'Mes projets')).toBe(
      `Intro  _gardée_ telle quelle.\n\nVoir [Mes projets](notes://${id}) ici.\n\n* une puce\n`,
    );
  });

  it('suit les mentions dans une liste, un tableau et un callout', () => {
    const corps = [
      `- [Projets](notes://${id})`,
      '',
      '| a |',
      '| - |',
      `| [Projets](notes://${id}) |`,
      '',
      '```notes-callout',
      `text: Voir [Projets](notes://${id}).`,
      '```',
      '',
    ].join('\n');
    const ecrit = renommerMentions(corps, id, 'Nouveau [titre]') ?? '';
    expect(ecrit.match(/\[Nouveau \\\[titre\\\]\]\(notes:\/\//g)).toHaveLength(3);
    const mentions: string[] = [];
    lireMarkdown(ecrit).document.descendants((noeud) => {
      if (noeud.type.name === 'pageMention') {
        mentions.push(String(noeud.attrs['libelle']));
      }
    });
    expect(mentions).toEqual(['Nouveau [titre]', 'Nouveau [titre]', 'Nouveau [titre]']);
  });

  it('rend null sans mention à changer', () => {
    expect(renommerMentions('Rien ici.\n', id, 'X')).toBeNull();
    expect(renommerMentions(`[Projets](notes://${id})\n`, id, 'Projets')).toBeNull();
    // Un lien interne au texte mis en forme n'est pas une mention : il n'est pas touché.
    expect(renommerMentions(`[*Projets*](notes://${id})\n`, id, 'Autre')).toBeNull();
    // Dans un bloc de code, ce n'est que du texte.
    expect(renommerMentions('```\n[Projets](notes://' + id + ')\n```\n', id, 'Autre')).toBeNull();
  });
});
