import { describe, expect, it, vi } from 'vitest';
import type { spawn } from 'node:child_process';
import { dossiersDesApplications, ouvrirLaBarre, programmeDeLEntree, trouverLaBarre } from './search-bar';

describe('dossiersDesApplications', () => {
  it('cherche d’abord chez l’utilisateur, puis dans les dossiers communs', () => {
    expect(dossiersDesApplications({}, '/maison')).toEqual(['/maison/.local/share/applications', '/usr/local/share/applications', '/usr/share/applications']);
    expect(dossiersDesApplications({ XDG_DATA_HOME: '/donnees', XDG_DATA_DIRS: '/a:/b' }, '/maison')).toEqual(['/donnees/applications', '/a/applications', '/b/applications']);
  });
});

describe('programmeDeLEntree', () => {
  it('lit le programme, entre guillemets ou non', () => {
    expect(programmeDeLEntree('[Desktop Entry]\nName=Barre\nExec="/opt/Barre de recherche.AppImage" %U\n')).toBe('/opt/Barre de recherche.AppImage');
    expect(programmeDeLEntree('Exec=/opt/barre --fond\n')).toBe('/opt/barre');
  });

  it('rend null sans ligne Exec', () => {
    expect(programmeDeLEntree('[Desktop Entry]\nName=Barre\n')).toBeNull();
    expect(programmeDeLEntree('Exec=\n')).toBeNull();
  });
});

describe('trouverLaBarre', () => {
  it('prend la première entrée trouvée', async () => {
    const lire = (chemin: string) => (chemin === '/b/barre-recherche.desktop' ? Promise.resolve('Exec=/opt/barre\n') : Promise.reject(new Error('absent')));
    expect(await trouverLaBarre(['/a', '/b'], lire)).toBe('/opt/barre');
    expect(await trouverLaBarre(['/a'], lire)).toBeNull();
  });
});

describe('ouvrirLaBarre', () => {
  it('rend false sans lancer quoi que ce soit si la barre n’est pas installée', async () => {
    const lancer = vi.fn();
    expect(await ouvrirLaBarre([], lancer as unknown as typeof spawn)).toBe(false);
    expect(lancer).not.toHaveBeenCalled();
  });
});
