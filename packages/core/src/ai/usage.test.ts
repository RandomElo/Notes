import { describe, expect, it } from 'vitest';
import { MemoryLocalFs, contexteDeTest } from '../testing/memory-fs';
import { ajouterALHistoriqueIa, appelsDuFichier, fusionnerAppels, lireAppel, lireHistoriqueIa } from './usage';
import type { AiRun } from './usage';
import { calibrer, debutDePeriode, ratioDeSortieParDefaut, totauxParPeriode } from './usage-stats';

const appel = (champs: Partial<AiRun> = {}): AiRun => ({
  id: '0192a0b0-0000-7000-8000-000000000001',
  date: new Date(2026, 9, 5, 10, 0).getTime(),
  fonction: 'relecture',
  fournisseur: 'litellm',
  modele: 'gpt-5.4-mini',
  entree: 1000,
  sortie: 1100,
  coutUsd: 0.00570,
  estimation: { entreeComptee: 1000, entree: 1000, sortie: 1050, coutUsd: 0.005475 },
  dureeMs: 4000,
  annule: false,
  ...champs,
});

describe('historique des appels IA', () => {
  it('ajoute un appel et le relit', async () => {
    const fs = MemoryLocalFs.depuis({});
    const contexte = contexteDeTest(fs);
    expect(await lireHistoriqueIa(contexte)).toEqual([]);
    await ajouterALHistoriqueIa(contexte, appel());
    expect(await lireHistoriqueIa(contexte)).toEqual([appel()]);
    expect(JSON.parse(await fs.lireTexte('.notes/ai-usage.json'))).toMatchObject({ version: 1, appels: [{ modele: 'gpt-5.4-mini' }] });
  });

  it('garde les appels des versions mises de côté par la sync', async () => {
    const autre = appel({ id: '0192a0b0-0000-7000-8000-000000000002', date: appel().date + 1000 });
    const fs = MemoryLocalFs.depuis({
      '.notes/ai-usage.json': JSON.stringify({ version: 1, appels: [appel()] }),
      '.notes/ai-usage.conflit-2026-10-05-101500.json': JSON.stringify({ version: 1, appels: [autre] }),
      '.notes/dictionary.txt': 'Vitest\n',
    });
    const contexte = contexteDeTest(fs);
    expect(await lireHistoriqueIa(contexte)).toEqual([appel(), autre]);
    const troisieme = appel({ id: '0192a0b0-0000-7000-8000-000000000003', date: appel().date + 2000 });
    await ajouterALHistoriqueIa(contexte, troisieme);
    expect(appelsDuFichier(await fs.lireTexte('.notes/ai-usage.json')).map((a) => a.id)).toEqual([appel().id, autre.id, troisieme.id]);
  });

  it('ignore un fichier abîmé ou un appel mal formé sans bloquer le reste', () => {
    expect(appelsDuFichier('{pas du json')).toEqual([]);
    expect(appelsDuFichier(JSON.stringify({ appels: [appel(), { id: 'x' }, null] }))).toEqual([appel()]);
    expect(lireAppel({ ...appel(), fournisseur: 'autre' })).toBeNull();
    expect(lireAppel({ ...appel(), entree: -3 })).toBeNull();
  });

  it('fusionne sans doublon, par date', () => {
    const tot = appel({ id: '0192a0b0-0000-7000-8000-00000000000a', date: 1 });
    expect(fusionnerAppels([appel()], [appel(), tot])).toEqual([tot, appel()]);
  });
});

describe('totaux et calage', () => {
  const maintenant = new Date(2026, 9, 5, 18, 0).getTime();

  it('découpe en jours, semaines (lundi), mois et années locaux', () => {
    expect(debutDePeriode(maintenant, 'jour')).toBe(new Date(2026, 9, 5).getTime());
    expect(debutDePeriode(maintenant, 'semaine')).toBe(new Date(2026, 9, 5).getTime()); // un lundi
    expect(debutDePeriode(new Date(2026, 9, 4, 23).getTime(), 'semaine')).toBe(new Date(2026, 8, 28).getTime());
    expect(debutDePeriode(maintenant, 'mois')).toBe(new Date(2026, 9, 1).getTime());
    expect(debutDePeriode(maintenant, 'annee')).toBe(new Date(2026, 0, 1).getTime());
  });

  it('additionne par période, périodes vides comprises', () => {
    const appels = [
      appel(),
      appel({ id: '0192a0b0-0000-7000-8000-000000000002', fournisseur: 'ollama', coutUsd: null }),
      appel({ id: '0192a0b0-0000-7000-8000-000000000003', date: new Date(2026, 9, 3, 9).getTime(), coutUsd: 0.01 }),
    ];
    const jours = totauxParPeriode(appels, 'jour', maintenant, 3);
    expect(jours.map((jour) => jour.appels)).toEqual([1, 0, 2]);
    expect(totauxParPeriode(appels, 'mois', maintenant, 2).map((mois) => mois.appels)).toEqual([0, 3]);
  });

  it('cale le ratio de sortie sur les appels du même modèle et de la même fonction', () => {
    expect(calibrer([], 'mise-au-propre', 'm')).toEqual({ ratioDeSortie: ratioDeSortieParDefaut['mise-au-propre'], facteurDEntree: 1, msParTokenDeSortie: null, appelsConnus: 0 });
    const appels = [
      appel({ id: '0192a0b0-0000-7000-8000-000000000002', sortie: 1200, estimation: { entreeComptee: 950, entree: 950, sortie: 1000, coutUsd: null } }),
      appel({ id: '0192a0b0-0000-7000-8000-000000000003', sortie: 1000, estimation: { entreeComptee: 950, entree: 950, sortie: 1000, coutUsd: null } }),
      appel({ id: '0192a0b0-0000-7000-8000-000000000004', sortie: 9000, annule: true }),
      appel({ id: '0192a0b0-0000-7000-8000-000000000005', modele: 'autre', sortie: 3000 }),
    ];
    const calage = calibrer(appels, 'relecture', 'gpt-5.4-mini');
    expect(calage.ratioDeSortie).toBeCloseTo(1.1);
    expect(calage.facteurDEntree).toBeCloseTo(1000 / 950);
    expect(calage.msParTokenDeSortie).toBeCloseTo((4000 / 1200 + 4000 / 1000) / 2);
    expect(calage.appelsConnus).toBe(2);
    // Modèle jamais utilisé pour cette fonction : les appels de la fonction, tous modèles.
    expect(calibrer(appels, 'relecture', 'neuf').ratioDeSortie).toBeCloseTo(1.2);
  });
});
