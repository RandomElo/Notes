import type { AiProvider } from '../ai/usage';

/**
 * Réglages des fonctions IA (README §12), propres au poste : chaque machine a
 * sa carte graphique, donc son adresse et ses modèles. Aucune clé ici : celle
 * de LiteLLM vit dans le coffre à secrets.
 */

/** Fonctions lancées depuis une page. La mise en forme des mémos viendra avec J13. */
export type AiPageFunction = 'relecture' | 'mise-au-propre';
export const fonctionsDePage: readonly AiPageFunction[] = ['relecture', 'mise-au-propre'];

export interface AiModelChoice {
  fournisseur: AiProvider;
  /** Nom du modèle chez le fournisseur. Vide pour Ollama : Notes choisit selon la carte graphique. */
  modele: string;
}

/** Tarif d'un modèle d'API, en dollars par million de tokens. */
export interface AiPrice {
  entree: number;
  sortie: number;
}

export interface AiSettings {
  /** Adresse d'Ollama, http ou https. */
  adresseOllama: string;
  /** Adresse de LiteLLM (API compatible OpenAI), vide tant qu'elle n'est pas réglée. */
  adresseLitellm: string;
  modeles: Record<AiPageFunction, AiModelChoice>;
  /** Consigne donnée au modèle, null pour celle de Notes. */
  consignes: Record<AiPageFunction, string | null>;
  /** Alerte quand la dépense du mois dépasse ce montant (dollars), null pour aucune alerte. */
  seuilMensuelUsd: number | null;
  /** Tarifs saisis à la main, par modèle de LiteLLM. Ils passent avant ceux que donne LiteLLM et ceux que connaît Notes. */
  tarifs: Record<string, AiPrice>;
}

export const adresseOllamaParDefaut = 'http://localhost:11434';
const longueurMaxDUneConsigne = 8000;

export const reglagesIaParDefaut: AiSettings = {
  adresseOllama: adresseOllamaParDefaut,
  adresseLitellm: '',
  modeles: {
    relecture: { fournisseur: 'ollama', modele: '' },
    'mise-au-propre': { fournisseur: 'ollama', modele: '' },
  },
  consignes: { relecture: null, 'mise-au-propre': null },
  seuilMensuelUsd: null,
  tarifs: {},
};

/** Une adresse http ou https, sans identifiant, requête ni fragment, sans `/` final. null si elle n'est pas acceptable. */
export function adresseDeServiceValide(valeur: unknown): string | null {
  if (typeof valeur !== 'string' || valeur.length > 500) {
    return null;
  }
  // Pas de `@` possible dans l'hôte : une adresse ne porte jamais d'identifiant.
  const trouve = /^(https?):\/\/([A-Za-z0-9.-]+|\[[0-9A-Fa-f:]+\])(:\d{1,5})?(\/[A-Za-z0-9._~%/-]*)?$/.exec(valeur.trim());
  if (trouve === null || (trouve[3] !== undefined && Number(trouve[3].slice(1)) > 65535)) {
    return null;
  }
  return `${trouve[1]!.toLowerCase()}://${trouve[2]!.toLowerCase()}${trouve[3] ?? ''}${(trouve[4] ?? '').replace(/\/+$/, '')}`;
}

/** Nom de modèle : lettres, chiffres et `.:_/-`, comme chez Ollama et LiteLLM. */
export function nomDeModeleValide(valeur: unknown): valeur is string {
  return typeof valeur === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(valeur);
}

const montant = (valeur: unknown): number | null => (typeof valeur === 'number' && Number.isFinite(valeur) && valeur >= 0 && valeur < 1e6 ? valeur : null);

function lireChoix(valeur: unknown, defaut: AiModelChoice): AiModelChoice {
  if (typeof valeur !== 'object' || valeur === null) {
    return { ...defaut };
  }
  const brut = valeur as Record<string, unknown>;
  const fournisseur = brut['fournisseur'] === 'litellm' ? 'litellm' : 'ollama';
  return { fournisseur, modele: nomDeModeleValide(brut['modele']) ? brut['modele'] : '' };
}

/** Lecture tolérante : ce qui est invalide reprend sa valeur par défaut. */
export function lireReglagesIa(valeur: unknown): AiSettings {
  if (typeof valeur !== 'object' || valeur === null) {
    return lireReglagesIa({});
  }
  const brut = valeur as Record<string, unknown>;
  const modeles = (typeof brut['modeles'] === 'object' && brut['modeles'] !== null ? brut['modeles'] : {}) as Record<string, unknown>;
  const consignes = (typeof brut['consignes'] === 'object' && brut['consignes'] !== null ? brut['consignes'] : {}) as Record<string, unknown>;
  const tarifs: Record<string, AiPrice> = {};
  if (typeof brut['tarifs'] === 'object' && brut['tarifs'] !== null) {
    for (const [modele, tarif] of Object.entries(brut['tarifs'] as Record<string, unknown>)) {
      if (nomDeModeleValide(modele) && typeof tarif === 'object' && tarif !== null) {
        const entree = montant((tarif as Record<string, unknown>)['entree']);
        const sortie = montant((tarif as Record<string, unknown>)['sortie']);
        if (entree !== null && sortie !== null) {
          tarifs[modele] = { entree, sortie };
        }
      }
    }
  }
  const consigne = (fonction: AiPageFunction): string | null => {
    const texte = consignes[fonction];
    return typeof texte === 'string' && texte.trim() !== '' && texte.length <= longueurMaxDUneConsigne ? texte : null;
  };
  return {
    adresseOllama: adresseDeServiceValide(brut['adresseOllama']) ?? adresseOllamaParDefaut,
    adresseLitellm: adresseDeServiceValide(brut['adresseLitellm']) ?? '',
    modeles: {
      relecture: lireChoix(modeles['relecture'], reglagesIaParDefaut.modeles.relecture),
      'mise-au-propre': lireChoix(modeles['mise-au-propre'], reglagesIaParDefaut.modeles['mise-au-propre']),
    },
    consignes: { relecture: consigne('relecture'), 'mise-au-propre': consigne('mise-au-propre') },
    seuilMensuelUsd: montant(brut['seuilMensuelUsd']),
    tarifs,
  };
}
