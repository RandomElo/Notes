import { describe, expect, it } from 'vitest';
import { estAdresseWeb, libelleDAdresse } from './links';

describe('liens externes', () => {
  it.each([
    ['https://www.google.com/', 'google.com'],
    ['http://example.com/page/', 'example.com/page'],
    ['https://fr.wikipedia.org/wiki/Markdown', 'fr.wikipedia.org/wiki/Markdown'],
    ['mailto:moi@example.com', 'moi@example.com'],
  ])('%s devient %s', (adresse, libelle) => {
    expect(libelleDAdresse(adresse)).toBe(libelle);
  });

  it('reconnaît une adresse seule', () => {
    expect(estAdresseWeb(' https://example.com/a?b=c ')).toBe(true);
    expect(estAdresseWeb('voir https://example.com')).toBe(false);
    expect(estAdresseWeb('example.com')).toBe(false);
    expect(estAdresseWeb('javascript:alert(1)')).toBe(false);
  });
});
