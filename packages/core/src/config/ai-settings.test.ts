import { describe, expect, it } from 'vitest';
import { adresseDeServiceValide, lireReglagesIa, nomDeModeleValide, reglagesIaParDefaut } from './ai-settings';

describe('réglages IA du poste', () => {
  it('reprend le défaut pour un contenu absent ou abîmé', () => {
    expect(lireReglagesIa(undefined)).toEqual(reglagesIaParDefaut);
    expect(lireReglagesIa({ adresseOllama: 'ftp://x', modeles: 3, seuilMensuelUsd: -2 })).toEqual(reglagesIaParDefaut);
  });

  it('garde des réglages valides', () => {
    const reglages = {
      adresseOllama: 'http://192.0.2.10:11434/',
      adresseLitellm: 'http://192.0.2.10:4000',
      modeles: { relecture: { fournisseur: 'litellm', modele: 'gpt-5.6-luna' }, 'mise-au-propre': { fournisseur: 'ollama', modele: 'ministral-3:8b' }, memo: { fournisseur: 'ollama', modele: '' } },
      consignes: { relecture: 'Relis.', 'mise-au-propre': '', memo: null },
      seuilMensuelUsd: 5,
      tarifs: { 'gpt-5.6-luna': { entree: 0.2, sortie: 1.2 }, 'mauvais nom': { entree: 1, sortie: 1 }, autre: { entree: 'x' } },
    };
    expect(lireReglagesIa(reglages)).toEqual({
      ...reglages,
      adresseOllama: 'http://192.0.2.10:11434',
      consignes: { relecture: 'Relis.', 'mise-au-propre': null, memo: null },
      tarifs: { 'gpt-5.6-luna': { entree: 0.2, sortie: 1.2 } },
    });
  });

  it('refuse une adresse avec identifiant, requête ou autre protocole', () => {
    expect(adresseDeServiceValide('http://localhost:11434')).toBe('http://localhost:11434');
    expect(adresseDeServiceValide('https://Serveur.local/ollama/')).toBe('https://serveur.local/ollama');
    expect(adresseDeServiceValide('http://[::1]:11434')).toBe('http://[::1]:11434');
    expect(adresseDeServiceValide('http://moi:secret@localhost:11434')).toBeNull();
    expect(adresseDeServiceValide('http://localhost:11434/?a=1')).toBeNull();
    expect(adresseDeServiceValide('http://localhost:99999')).toBeNull();
    expect(adresseDeServiceValide('file:///etc/passwd')).toBeNull();
  });

  it('accepte les noms de modèles d’Ollama et de LiteLLM', () => {
    expect(nomDeModeleValide('qwen3:8b')).toBe(true);
    expect(nomDeModeleValide('hf.co/bartowski/Ministral-8B-GGUF:Q4_K_M')).toBe(true);
    expect(nomDeModeleValide('gpt-5.4-mini')).toBe(true);
    expect(nomDeModeleValide('')).toBe(false);
    expect(nomDeModeleValide('a b')).toBe(false);
  });
});
