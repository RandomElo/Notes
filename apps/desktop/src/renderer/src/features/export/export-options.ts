import { margesDePage } from '../../../../shared/ipc-contract';
import type { PageMargins } from '../../../../shared/ipc-contract';

export const formatsDExport = ['pdf', 'markdown', 'html', 'zip'] as const;
export type ExportFormat = (typeof formatsDExport)[number];

/** Les choix de la fenêtre d'export, retenus d'un export à l'autre (README §9). */
export interface ExportOptions {
  format: ExportFormat;
  /** PDF : marges, icônes (de la page, des mentions, des sites). Le papier est toujours en A4. */
  marges: PageMargins;
  icones: boolean;
  /** Markdown : garder le front-matter en tête du fichier. */
  enTete: boolean;
}

export const optionsParDefaut: ExportOptions = { format: 'pdf', marges: 'normales', icones: true, enTete: false };

/** Vrai pour des options relues du stockage local, champ par champ. */
export function estOptionsDExport(valeur: unknown): valeur is ExportOptions {
  if (typeof valeur !== 'object' || valeur === null) {
    return false;
  }
  const options = valeur as Record<string, unknown>;
  return (
    (formatsDExport as readonly unknown[]).includes(options['format']) &&
    (margesDePage as readonly unknown[]).includes(options['marges']) &&
    typeof options['icones'] === 'boolean' &&
    typeof options['enTete'] === 'boolean'
  );
}
