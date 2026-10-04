import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
import { creerHandlersExport, lireDemande, nomDeFichier } from './export';

function preparer(destination: string | null = '/tmp/sortie/Page.md') {
  const ecrits = new Map<string, Uint8Array>();
  const dependances = {
    choisirDestination: vi.fn(async () => destination),
    imprimer: vi.fn(async () => new Uint8Array([37, 80, 68, 70])),
    ecrire: vi.fn(async (chemin: string, octets: Uint8Array) => void ecrits.set(chemin, octets)),
    montrer: vi.fn(),
    ouvrir: vi.fn(),
    lireImage: vi.fn(async (chemin: string) => (chemin === 'A/assets/x.webp' ? { octets: new Uint8Array([1]), type: 'image/webp' } : null)),
  };
  return { handlers: creerHandlersExport(dependances), dependances, ecrits };
}

describe('handlers d’export', () => {
  it('écrit le Markdown là où l’utilisateur l’a choisi, avec le nom proposé', async () => {
    const { handlers, dependances, ecrits } = preparer();
    const resultat = await handlers.exporter({ format: 'markdown', nom: 'Réseau : maison', texte: 'Texte' });
    expect(resultat).toEqual({ ok: true, chemin: '/tmp/sortie/Page.md', nom: 'Page.md' });
    expect(dependances.choisirDestination).toHaveBeenCalledWith('Réseau - maison.md', { extension: 'md', libelle: 'Markdown' });
    expect(strFromU8(ecrits.get('/tmp/sortie/Page.md') as Uint8Array)).toBe('Texte');
    // Puis il est ouvert, pour voir le résultat.
    expect(dependances.ouvrir).toHaveBeenCalledWith('/tmp/sortie/Page.md');
  });

  it('n’écrit rien quand la boîte « Enregistrer sous » est fermée', async () => {
    const { handlers, dependances } = preparer(null);
    expect(await handlers.exporter({ format: 'html', nom: 'Page', texte: '<p>x</p>' })).toEqual({ ok: false, annule: true });
    expect(dependances.ecrire).not.toHaveBeenCalled();
    expect(dependances.ouvrir).not.toHaveBeenCalled();
  });

  it('imprime le PDF avec le papier, les marges et le titre demandés', async () => {
    const { handlers, dependances } = preparer('/tmp/Page.pdf');
    await handlers.exporter({ format: 'pdf', nom: 'Page', titre: 'Page', html: '<p>x</p>', papier: 'A5', marges: 'larges' });
    expect(dependances.imprimer).toHaveBeenCalledWith('<p>x</p>', { papier: 'A5', marges: 'larges', titre: 'Page' });
  });

  it('assemble l’archive ZIP', async () => {
    const { handlers, ecrits } = preparer('/tmp/Page.zip');
    await handlers.exporter({ format: 'zip', nom: 'Page', fichiers: [{ chemin: 'Page/Page.md', octets: new Uint8Array([65]) }] });
    expect(Object.keys(unzipSync(ecrits.get('/tmp/Page.zip') as Uint8Array))).toEqual(['Page/Page.md']);
  });

  it('dit l’échec sans détail système', async () => {
    const { handlers, dependances } = preparer();
    dependances.ecrire.mockRejectedValueOnce(new Error('EACCES: /home/quelquun'));
    expect(await handlers.exporter({ format: 'markdown', nom: 'Page', texte: 'x' })).toEqual({ ok: false, annule: false, message: "L'export n'a pas pu être écrit." });
  });

  it('ne montre que les fichiers exportés', async () => {
    const { handlers, dependances } = preparer();
    handlers.montrer({ chemin: '/etc/passwd' });
    expect(dependances.montrer).not.toHaveBeenCalled();
    await handlers.exporter({ format: 'markdown', nom: 'Page', texte: 'x' });
    handlers.montrer({ chemin: '/tmp/sortie/Page.md' });
    expect(dependances.montrer).toHaveBeenCalledWith('/tmp/sortie/Page.md');
  });

  it('lit une image du dossier des notes, et rien d’autre', async () => {
    const { handlers } = preparer();
    expect(await handlers.lireImage({ chemin: 'A/assets/x.webp' })).toEqual({ ok: true, octets: new Uint8Array([1]), type: 'image/webp' });
    expect(await handlers.lireImage({ chemin: '../x.webp' })).toEqual({ ok: false });
  });
});

describe('lireDemande', () => {
  it('refuse une demande mal formée', () => {
    expect(lireDemande(null)).toBeNull();
    expect(lireDemande({ format: 'exe', nom: 'x', texte: '' })).toBeNull();
    expect(lireDemande({ format: 'pdf', nom: 'x', titre: 'x', html: '', papier: 'A3', marges: 'normales' })).toBeNull();
    expect(lireDemande({ format: 'zip', nom: 'x', fichiers: [{ chemin: '../x', octets: new Uint8Array() }] })).toBeNull();
    expect(lireDemande({ format: 'zip', nom: 'x', fichiers: [{ chemin: 'x', octets: 'texte' }] })).toBeNull();
  });
});

describe('nomDeFichier', () => {
  it('assainit le titre et ajoute l’extension', () => {
    expect(nomDeFichier('a/b', 'pdf')).toBe('a-b.pdf');
    expect(nomDeFichier('  ', 'zip')).toBe('Export.zip');
  });
});
