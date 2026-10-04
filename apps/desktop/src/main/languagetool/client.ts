import type { SpellcheckRequest, SpellIssue } from '../../shared/ipc-contract';

/** Un bloc fait au plus quelques milliers de caractères ; au-delà, la demande est refusée. */
export const longueurMaxDuTexte = 20_000;
const suggestionsMax = 5;

/** Ce que LanguageTool lit à la place d'un passage exclu (code, adresse, mention) : un mot neutre, pour que la phrase reste une phrase. */
export const lectureDUnExclu = 'X';

/** Revérifie une demande venue du renderer. null si elle n'a pas la bonne forme. */
export function verifierDemande(recu: unknown): SpellcheckRequest | null {
  if (typeof recu !== 'object' || recu === null) {
    return null;
  }
  const { texte, exclus } = recu as { texte?: unknown; exclus?: unknown };
  if (typeof texte !== 'string' || texte.length > longueurMaxDuTexte || !Array.isArray(exclus) || exclus.length > texte.length) {
    return null;
  }
  const plages: [number, number][] = [];
  let fin = 0;
  for (const plage of exclus) {
    if (!Array.isArray(plage) || plage.length !== 2) {
      return null;
    }
    const [de, a] = plage as unknown[];
    if (!Number.isInteger(de) || !Number.isInteger(a) || (de as number) < fin || (a as number) <= (de as number) || (a as number) > texte.length) {
      return null;
    }
    plages.push([de as number, a as number]);
    fin = a as number;
  }
  return { texte, exclus: plages };
}

/**
 * Texte annoté pour LanguageTool : les passages exclus sont du « balisage »
 * qu'il ne vérifie pas, lu comme un mot neutre. Les positions de ses réponses
 * restent celles du texte d'origine.
 */
export function annotation({ texte, exclus }: SpellcheckRequest): { annotation: ({ text: string } | { markup: string; interpretAs: string })[] } {
  const morceaux: ({ text: string } | { markup: string; interpretAs: string })[] = [];
  let curseur = 0;
  for (const [de, a] of exclus) {
    if (de > curseur) {
      morceaux.push({ text: texte.slice(curseur, de) });
    }
    morceaux.push({ markup: texte.slice(de, a), interpretAs: lectureDUnExclu });
    curseur = a;
  }
  if (curseur < texte.length) {
    morceaux.push({ text: texte.slice(curseur) });
  }
  return { annotation: morceaux };
}

const texteOuVide = (valeur: unknown): string => (typeof valeur === 'string' ? valeur : '');

/** Les fautes d'une réponse de LanguageTool, relue sans lui faire confiance : positions bornées au texte. */
export function lireReponse(json: unknown, texte: string): SpellIssue[] {
  const matches = typeof json === 'object' && json !== null ? (json as { matches?: unknown }).matches : undefined;
  if (!Array.isArray(matches)) {
    return [];
  }
  const fautes: SpellIssue[] = [];
  for (const match of matches as unknown[]) {
    if (typeof match !== 'object' || match === null) {
      continue;
    }
    const { offset, length, message, shortMessage, replacements, rule } = match as Record<string, unknown>;
    if (!Number.isInteger(offset) || !Number.isInteger(length) || (offset as number) < 0 || (length as number) <= 0 || (offset as number) + (length as number) > texte.length) {
      continue;
    }
    const regle = typeof rule === 'object' && rule !== null ? (rule as Record<string, unknown>) : {};
    const suggestions = Array.isArray(replacements)
      ? (replacements as unknown[])
          .map((remplacement) => (typeof remplacement === 'object' && remplacement !== null ? texteOuVide((remplacement as { value?: unknown }).value) : ''))
          .filter((valeur) => valeur !== '')
          .slice(0, suggestionsMax)
      : [];
    const de = offset as number;
    const a = de + (length as number);
    fautes.push({
      de,
      a,
      mot: texte.slice(de, a),
      message: texteOuVide(message) || texteOuVide(shortMessage),
      regle: texteOuVide(regle['id']),
      nature: regle['issueType'] === 'misspelling' ? 'orthographe' : 'grammaire',
      suggestions,
    });
  }
  return fautes;
}

/** Vérifie un texte en français. null si le serveur ne répond pas : la correction se tait, rien n'est bloqué. */
export async function verifierTexte(adresse: string, demande: SpellcheckRequest, delaiMs = 10_000): Promise<SpellIssue[] | null> {
  try {
    const reponse = await fetch(`${adresse}/v2/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ data: JSON.stringify(annotation(demande)), language: 'fr' }),
      signal: AbortSignal.timeout(delaiMs),
    });
    return reponse.ok ? lireReponse(await reponse.json(), demande.texte) : null;
  } catch {
    return null;
  }
}
