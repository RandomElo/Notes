/**
 * Réglages des fonctions IA (docs/spec/ia.md), propres au poste : chaque machine a
 * sa carte graphique, donc son adresse et ses modèles. Tout passe par Ollama
 * (LiteLLM abandonné le 2026-10-09). Les anciennes clés `adresseLitellm`,
 * `tarifs` et `seuilMensuelUsd` d'un `settings.json` sont ignorées.
 */

/** Fonctions réglables : les deux d'une page (J12), et la mise en forme des mémos vocaux (J13). */
export type AiPageFunction = 'relecture' | 'mise-au-propre' | 'memo';
export const fonctionsDePage: readonly AiPageFunction[] = ['relecture', 'mise-au-propre', 'memo'];

export interface AiModelChoice {
  /** Modèle d'Ollama choisi à la main, vide pour que Notes choisisse selon la carte graphique. */
  modele: string;
}

export interface AiSettings {
  /** Adresse d'Ollama, http ou https. */
  adresseOllama: string;
  modeles: Record<AiPageFunction, AiModelChoice>;
  /** Consigne donnée au modèle, null pour celle de Notes. */
  consignes: Record<AiPageFunction, string | null>;
}

export const adresseOllamaParDefaut = 'http://localhost:11434';
const longueurMaxDUneConsigne = 8000;

export const reglagesIaParDefaut: AiSettings = {
  adresseOllama: adresseOllamaParDefaut,
  modeles: { relecture: { modele: '' }, 'mise-au-propre': { modele: '' }, memo: { modele: '' } },
  consignes: { relecture: null, 'mise-au-propre': null, memo: null },
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

/** Nom de modèle : lettres, chiffres et `.:_/-`, comme chez Ollama. */
export function nomDeModeleValide(valeur: unknown): valeur is string {
  return typeof valeur === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(valeur);
}

function lireChoix(valeur: unknown, defaut: AiModelChoice): AiModelChoice {
  if (typeof valeur !== 'object' || valeur === null) {
    return { ...defaut };
  }
  const brut = valeur as Record<string, unknown>;
  // Un choix de LiteLLM (versions 0.12.x) revient au choix automatique d'Ollama.
  return { modele: brut['fournisseur'] !== 'litellm' && nomDeModeleValide(brut['modele']) ? brut['modele'] : '' };
}

/** Lecture tolérante : ce qui est invalide reprend sa valeur par défaut. */
export function lireReglagesIa(valeur: unknown): AiSettings {
  if (typeof valeur !== 'object' || valeur === null) {
    return lireReglagesIa({});
  }
  const brut = valeur as Record<string, unknown>;
  const modeles = (typeof brut['modeles'] === 'object' && brut['modeles'] !== null ? brut['modeles'] : {}) as Record<string, unknown>;
  const consignes = (typeof brut['consignes'] === 'object' && brut['consignes'] !== null ? brut['consignes'] : {}) as Record<string, unknown>;
  const consigne = (fonction: AiPageFunction): string | null => {
    const texte = consignes[fonction];
    return typeof texte === 'string' && texte.trim() !== '' && texte.length <= longueurMaxDUneConsigne ? texte : null;
  };
  return {
    adresseOllama: adresseDeServiceValide(brut['adresseOllama']) ?? adresseOllamaParDefaut,
    modeles: {
      relecture: lireChoix(modeles['relecture'], reglagesIaParDefaut.modeles.relecture),
      'mise-au-propre': lireChoix(modeles['mise-au-propre'], reglagesIaParDefaut.modeles['mise-au-propre']),
      memo: lireChoix(modeles['memo'], reglagesIaParDefaut.modeles.memo),
    },
    consignes: { relecture: consigne('relecture'), 'mise-au-propre': consigne('mise-au-propre'), memo: consigne('memo') },
  };
}
