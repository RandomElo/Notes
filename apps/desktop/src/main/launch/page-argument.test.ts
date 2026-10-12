import { describe, expect, it } from 'vitest';
import { pageDemandee, sansPage } from './page-argument';

const id = '01a12cf8-f981-789a-bcf1-d2f5b6b17039';

describe('argument --page', () => {
  it('lit l’identifiant de la page à ouvrir, et rien d’autre', () => {
    expect(pageDemandee(['/opt/Notes.AppImage', `--page=${id}`])).toBe(id);
    expect(pageDemandee([`--page=${id.toUpperCase()}`])).toBe(id);
    expect(pageDemandee(['--page=../../etc/passwd'])).toBeNull();
    expect(pageDemandee(['--page='])).toBeNull();
    expect(pageDemandee(['/opt/Notes.AppImage'])).toBeNull();
  });

  it('se retire des arguments d’une relance', () => {
    expect(sansPage(['--user-data-dir=/tmp/p', `--page=${id}`])).toEqual(['--user-data-dir=/tmp/p']);
  });
});
