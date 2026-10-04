import { describe, expect, it } from 'vitest';
import { natureDIcone } from './icon';

describe('natureDIcone', () => {
  it.each([
    ['📚', { genre: 'emoji', emoji: '📚' }],
    ['👍🏽', { genre: 'emoji', emoji: '👍🏽' }],
    ['book-open', { genre: 'lucide', nom: 'book-open' }],
    ['house', { genre: 'lucide', nom: 'house' }],
    ['assets/icone.webp', { genre: 'image', src: 'assets/icone.webp' }],
    ['assets/Logo-2.PNG', { genre: 'image', src: 'assets/Logo-2.PNG' }],
  ])('%s', (valeur, attendu) => {
    expect(natureDIcone(valeur)).toEqual(attendu);
  });

  it.each([null, '', '  ', 'Book Open', 'book_open', 'assets/../x.png', '../assets/x.png', 'assets/sous/x.png', 'https://example.com/x.png', 'assets/x.txt', 'é é', '😀\n😀'])(
    'refuse %j',
    (valeur) => {
      expect(natureDIcone(valeur)).toBeNull();
    },
  );
});
