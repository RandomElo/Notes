import { describe, expect, it } from 'vitest';
import { RemoteFsError } from '../fs/remote-fs';
import { MemoryIndexStore, MemoryLocalFs } from '../testing/memory-fs';
import { MemoryRemoteFs } from '../testing/memory-remote-fs';
import { etatLocalDePage, synchroniser } from './engine';
import { ecrireVerrou } from './lock';

const instant = Date.UTC(2026, 9, 3, 12, 0, 0);

/** Un appareil : son vault local et son index de sync. Le NAS est partagé. */
class Appareil {
  readonly index = new MemoryIndexStore();
  constructor(
    readonly fs: MemoryLocalFs,
    readonly nas: MemoryRemoteFs,
    readonly nom = 'a',
  ) {}

  cycle() {
    return synchroniser({ local: this.fs, distant: this.nas, index: this.index, cle: 'vault', maintenant: () => instant, appareil: this.nom });
  }
}

function deuxAppareils(fichiersA: Record<string, string> = {}, fichiersB: Record<string, string> = {}) {
  const nas = new MemoryRemoteFs();
  return { nas, a: new Appareil(MemoryLocalFs.depuis(fichiersA), nas, 'a'), b: new Appareil(MemoryLocalFs.depuis(fichiersB), nas, 'b') };
}

describe('synchroniser', () => {
  it('pousse un vault neuf, puis ne fait plus rien', async () => {
    const { nas, a } = deuxAppareils({ 'Alpha/page.md': 'alpha\n', 'Alpha/Beta/page.md': 'beta\n', '.order': 'x\n' });
    const premier = await a.cycle();
    expect(premier.pousses.sort()).toEqual(['.order', 'Alpha/Beta/page.md', 'Alpha/page.md']);
    expect(nas.contenu()).toEqual(a.fs.contenu());

    const ecrituresNas = nas.ecritures;
    const ecrituresLocales = a.fs.ecritures;
    const second = await a.cycle();
    expect(second.pousses).toEqual([]);
    expect(second.tires).toEqual([]);
    expect(nas.ecritures).toBe(ecrituresNas);
    expect(a.fs.ecritures).toBe(ecrituresLocales);
  });

  it('fait passer une page d’un appareil à l’autre, dans les deux sens', async () => {
    const { a, b } = deuxAppareils({ 'Alpha/page.md': 'v1\n' });
    await a.cycle();
    await b.cycle();
    expect(b.fs.contenu()).toEqual({ 'Alpha/page.md': 'v1\n' });

    await b.fs.ecrireTexte('Alpha/page.md', 'v2 écrite sur b\n');
    await b.cycle();
    const recu = await a.cycle();
    expect(recu.tires).toEqual(['Alpha/page.md']);
    expect(a.fs.contenu()).toEqual({ 'Alpha/page.md': 'v2 écrite sur b\n' });
  });

  it('garde la version du NAS à côté quand les deux côtés ont modifié la même page', async () => {
    const { nas, a, b } = deuxAppareils({ 'Alpha/page.md': 'départ\n' });
    await a.cycle();
    await b.cycle();
    await a.fs.ecrireTexte('Alpha/page.md', 'version de a\n');
    await b.fs.ecrireTexte('Alpha/page.md', 'version de b\n');
    await a.cycle();

    const rapport = await b.cycle();
    expect(rapport.conflits).toHaveLength(1);
    const sauvegarde = rapport.conflits[0]!;
    expect(sauvegarde).toMatch(/^Alpha\/page\.conflit-\d{4}-\d{2}-\d{2}-\d{6}\.md$/);
    expect(b.fs.contenu()).toEqual({ 'Alpha/page.md': 'version de b\n', [sauvegarde]: 'version de a\n' });
    expect(nas.contenu()['Alpha/page.md']).toBe('version de b\n');
    expect(rapport.sauvegardes).toEqual([sauvegarde]);

    // Au cycle suivant, chacun a les deux versions.
    await b.cycle();
    await a.cycle();
    expect(a.fs.contenu()).toEqual(b.fs.contenu());
  });

  it('ne voit pas de conflit quand les deux côtés ont le même contenu', async () => {
    const { nas, a } = deuxAppareils({ 'Alpha/page.md': 'pareil\n' });
    nas.poser('Alpha/page.md', 'pareil\n');
    const rapport = await a.cycle();
    expect(rapport.conflits).toEqual([]);
    expect(rapport.pousses).toEqual([]);
    expect(a.fs.contenu()).toEqual({ 'Alpha/page.md': 'pareil\n' });
  });

  it('fusionne deux vaults jamais synchronisés sans rien perdre', async () => {
    const { nas, a } = deuxAppareils({ 'Alpha/page.md': 'poste\n', 'Local/page.md': 'seulement ici\n' });
    nas.poser('Alpha/page.md', 'nas\n');
    nas.poser('Distant/page.md', 'seulement là-bas\n');
    const rapport = await a.cycle();
    expect(rapport.conflits).toHaveLength(1);
    expect(Object.values(a.fs.contenu()).sort()).toEqual(['nas\n', 'poste\n', 'seulement ici\n', 'seulement là-bas\n']);
  });

  it('ne pousse rien quand seule la date a changé', async () => {
    const { nas, a } = deuxAppareils({ 'Alpha/page.md': 'texte\n' });
    await a.cycle();
    a.fs.toucher('Alpha/page.md');
    const ecritures = nas.ecritures;
    await a.cycle();
    expect(nas.ecritures).toBe(ecritures);
    // L'index a retenu la nouvelle date : la page compte comme poussée.
    expect(await etatLocalDePage(a.fs, a.index, 'vault', 'Alpha')).toBe('poussee');
  });

  it('propage un renommage de page et supprime l’ancien dossier', async () => {
    const { nas, a, b } = deuxAppareils({ 'Alpha/page.md': 'alpha\n', 'Alpha/assets/x.txt': 'x' });
    await a.cycle();
    await b.cycle();
    await a.fs.renommer('Alpha', 'Gamma');
    await a.cycle();
    expect(nas.contenu()).toEqual({ 'Gamma/assets/x.txt': 'x', 'Gamma/page.md': 'alpha\n' });
    expect(nas.listeDesDossiers()).toEqual(['Gamma', 'Gamma/assets']);

    await b.cycle();
    expect(b.fs.contenu()).toEqual({ 'Gamma/assets/x.txt': 'x', 'Gamma/page.md': 'alpha\n' });
    expect(await b.fs.infos('Alpha')).toBeNull();
  });

  it('récupère un fichier supprimé sur le poste mais modifié sur le NAS', async () => {
    const { nas, a, b } = deuxAppareils({ 'Alpha/page.md': 'v1\n' });
    await a.cycle();
    await b.cycle();
    await a.fs.supprimer('Alpha');
    await b.fs.ecrireTexte('Alpha/page.md', 'v2\n');
    await b.cycle();
    const rapport = await a.cycle();
    expect(rapport.tires).toEqual(['Alpha/page.md']);
    expect(a.fs.contenu()).toEqual({ 'Alpha/page.md': 'v2\n' });
    expect(nas.contenu()).toEqual({ 'Alpha/page.md': 'v2\n' });
  });

  it('repousse un fichier supprimé sur le NAS mais modifié sur le poste', async () => {
    const { nas, a } = deuxAppareils({ 'Alpha/page.md': 'v1\n', 'Beta/page.md': 'b\n' });
    await a.cycle();
    nas.retirer('Alpha');
    await a.fs.ecrireTexte('Alpha/page.md', 'v2\n');
    await a.cycle();
    expect(nas.contenu()['Alpha/page.md']).toBe('v2\n');
  });

  it('ne supprime rien quand un côté est entièrement vide', async () => {
    const { nas, a } = deuxAppareils({ 'Alpha/page.md': 'a\n', 'Beta/page.md': 'b\n' });
    await a.cycle();
    // Disque démonté ou dossier vidé : ce n'est pas une suppression voulue.
    await a.fs.supprimer('Alpha');
    await a.fs.supprimer('Beta');
    const rapport = await a.cycle();
    expect(rapport.indexIgnore).toBe(true);
    expect(rapport.supprimesDistant).toEqual([]);
    expect(nas.contenu()).toEqual({ 'Alpha/page.md': 'a\n', 'Beta/page.md': 'b\n' });
    expect(a.fs.contenu()).toEqual(nas.contenu());
  });

  it('ne transporte ni les verrous, ni les fichiers temporaires, ni la corbeille du NAS', async () => {
    const { nas, a } = deuxAppareils({ 'Alpha/page.md': 'a\n', 'Alpha/.page.md.1a2b.tmp': 'moitié' });
    nas.poser('Beta/page.md', 'b\n');
    nas.poser('Beta/.lock', '{}');
    nas.poser('.trash/Vieux/page.md', 'jeté\n');
    await a.cycle();
    expect(a.fs.contenu()).toEqual({ 'Alpha/.page.md.1a2b.tmp': 'moitié', 'Alpha/page.md': 'a\n', 'Beta/page.md': 'b\n' });
    expect(Object.keys(nas.contenu()).sort()).toEqual(['.trash/Vieux/page.md', 'Alpha/page.md', 'Beta/.lock', 'Beta/page.md']);
  });

  it('met de côté les fichiers dont le nom est refusé par SMB', async () => {
    const { nas, a } = deuxAppareils({ 'Alpha/page.md': 'a\n', 'note: brouillon.md': 'x' });
    const rapport = await a.cycle();
    expect(rapport.refuses).toEqual(['note: brouillon.md']);
    expect(Object.keys(nas.contenu())).toEqual(['Alpha/page.md']);
  });

  it('laisse pour le cycle suivant un fichier modifié pendant le transfert', async () => {
    const { nas, a, b } = deuxAppareils({ 'Alpha/page.md': 'v1\n' });
    await a.cycle();
    await b.cycle();
    nas.poser('Alpha/page.md', 'v2 du NAS\n');
    // Au moment où b va lire la version du NAS, l'éditeur de b enregistre une frappe.
    nas.avantOperation = (operation, chemin) => {
      if (operation === 'lire' && chemin === 'Alpha/page.md') {
        nas.avantOperation = null;
        void b.fs.ecrireTexte('Alpha/page.md', 'frappe de b\n');
      }
    };
    const rapport = await b.cycle();
    expect(rapport.reportes).toEqual(['Alpha/page.md']);
    expect(b.fs.contenu()['Alpha/page.md']).toBe('frappe de b\n');

    // Le cycle suivant voit les deux modifications : rien n'est perdu.
    const suite = await b.cycle();
    expect(suite.conflits).toHaveLength(1);
    expect(Object.values(b.fs.contenu()).sort()).toEqual(['frappe de b\n', 'v2 du NAS\n']);
  });

  it('s’arrête sur une panne réseau en gardant ce qui est fait', async () => {
    const { nas, a } = deuxAppareils({ 'A/page.md': 'a\n', 'B/page.md': 'b\n', 'C/page.md': 'c\n' });
    let envois = 0;
    nas.avantOperation = (operation) => {
      if (operation === 'ecrire' && ++envois === 2) {
        nas.panne = true;
      }
    };
    // La panne arrive juste après le deuxième envoi, avant sa vérification.
    await expect(a.cycle()).rejects.toThrow(RemoteFsError);
    expect(Object.keys(nas.contenu())).toEqual(['A/page.md', 'B/page.md']);

    nas.panne = false;
    nas.avantOperation = null;
    const reprise = await a.cycle();
    // B est arrivé mais n'est pas dans l'index : les contenus sont comparés, identiques, rien ne repart.
    expect(reprise.pousses).toEqual(['C/page.md']);
    expect(reprise.conflits).toEqual([]);
    expect(nas.contenu()).toEqual(a.fs.contenu());
  });

  it('signale une erreur sur un fichier sans arrêter le cycle', async () => {
    const { nas, a } = deuxAppareils({ 'A/page.md': 'a\n', 'B/page.md': 'b\n' });
    nas.echouerSur = (operation, chemin) => operation === 'ecrire' && chemin === 'A/page.md';
    const rapport = await a.cycle();
    expect(rapport.erreurs.map((erreur) => erreur.chemin)).toEqual(['A/page.md']);
    expect(Object.keys(nas.contenu())).toEqual(['B/page.md']);
  });

  it('supprime le dossier d’une page renommée malgré le verrou laissé par cet appareil', async () => {
    const { nas, a } = deuxAppareils({ 'Alpha/page.md': 'a\n' });
    await a.cycle();
    nas.poser('Alpha/.lock', ecrireVerrou({ appareil: 'a', nom: 'poste', pid: 1, heartbeat: instant }));
    await a.fs.renommer('Alpha', 'Beta');
    await a.cycle();
    expect(nas.listeDesDossiers()).toEqual(['Beta']);
  });

  it('garde le dossier quand un autre appareil y tient un verrou vivant', async () => {
    const { nas, a } = deuxAppareils({ 'Alpha/page.md': 'a\n' });
    await a.cycle();
    nas.poser('Alpha/.lock', ecrireVerrou({ appareil: 'telephone', nom: 'téléphone', pid: 1, heartbeat: instant - 10_000 }));
    await a.fs.renommer('Alpha', 'Beta');
    await a.cycle();
    expect(nas.listeDesDossiers()).toEqual(['Alpha', 'Beta']);
    // Le dossier reste vide sur le poste tant que le verrou est là : il ne revient pas dans l'arborescence.
    expect(await a.fs.infos('Alpha')).toBeNull();
  });

  it('crée et supprime les dossiers vides', async () => {
    const { nas, a, b } = deuxAppareils();
    await a.fs.creerDossier('Vide/Sous');
    await a.cycle();
    expect(nas.listeDesDossiers()).toEqual(['Vide', 'Vide/Sous']);
    await b.cycle();
    expect(await b.fs.infos('Vide/Sous')).not.toBeNull();
    await a.fs.creerDossier('Garde');
    await a.fs.ecrireTexte('Garde/page.md', 'g\n');
    await a.cycle();
    await a.fs.supprimer('Vide');
    await a.cycle();
    expect(nas.listeDesDossiers()).toEqual(['Garde']);
  });

  it('change la casse d’une page par un renommage sur le NAS, sans rien supprimer', async () => {
    const nas = new MemoryRemoteFs(true);
    const a = new Appareil(MemoryLocalFs.depuis({ 'courses/page.md': 'lait\n', 'courses/assets/x.txt': 'x' }), nas, 'a');
    const b = new Appareil(new MemoryLocalFs(), nas, 'b');
    await a.cycle();
    await b.cycle();

    await a.fs.renommer('courses', 'Courses');
    const rapport = await a.cycle();
    expect(rapport.supprimesDistant).toEqual([]);
    expect(nas.contenu()).toEqual({ 'Courses/assets/x.txt': 'x', 'Courses/page.md': 'lait\n' });
    // Rien ne bouge au cycle suivant : l'index suit le nouveau nom.
    const suivant = await a.cycle();
    expect([...suivant.pousses, ...suivant.tires, ...suivant.supprimesLocal, ...suivant.supprimesDistant]).toEqual([]);

    // L'autre appareil renomme sa copie au lieu de la supprimer puis de la recevoir.
    const recu = await b.cycle();
    expect(recu.supprimesLocal).toEqual([]);
    expect(b.fs.contenu()).toEqual({ 'Courses/assets/x.txt': 'x', 'Courses/page.md': 'lait\n' });
    expect(await b.fs.infos('courses')).toBeNull();
  });

  it('laisse de côté deux noms qui ne diffèrent que par la casse', async () => {
    const nas = new MemoryRemoteFs(true);
    const a = new Appareil(MemoryLocalFs.depuis({ 'Note/page.md': 'a\n', 'note/page.md': 'b\n', 'Autre/page.md': 'c\n' }), nas, 'a');
    const rapport = await a.cycle();
    expect(rapport.erreurs.map((erreur) => erreur.chemin)).toEqual(['Note', 'note']);
    expect(nas.contenu()).toEqual({ 'Autre/page.md': 'c\n' });
  });

  it('dit si une page est poussée, en attente ou absente', async () => {
    const { a } = deuxAppareils({ 'Alpha/page.md': 'a\n' });
    expect(await etatLocalDePage(a.fs, a.index, 'vault', 'Alpha')).toBe('en_attente');
    await a.cycle();
    expect(await etatLocalDePage(a.fs, a.index, 'vault', 'Alpha')).toBe('poussee');
    await a.fs.ecrireTexte('Alpha/page.md', 'b\n');
    expect(await etatLocalDePage(a.fs, a.index, 'vault', 'Alpha')).toBe('en_attente');
    expect(await etatLocalDePage(a.fs, a.index, 'vault', 'Beta')).toBe('absente');
  });

  it('repart d’un index vide quand le couple de dossiers change', async () => {
    const { nas, a } = deuxAppareils({ 'Alpha/page.md': 'a\n' });
    await a.cycle();
    const autre = await synchroniser({ local: a.fs, distant: nas, index: a.index, cle: 'autre', maintenant: () => instant, appareil: 'a' });
    expect(autre.pousses).toEqual([]);
    expect(autre.conflits).toEqual([]);
  });
});
