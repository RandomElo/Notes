import { useMemo, useState } from 'react';
import { comparerTextes, replier, resumer } from './diff-model';
import type { DiffRow, DisplayRow, Segment } from './diff-model';

export type ComparisonMode = 'colonnes' | 'unifie';
export const estModeDeComparaison = (valeur: unknown): valeur is ComparisonMode => valeur === 'colonnes' || valeur === 'unifie';

/** Une ligne de texte, mots changés surlignés : rouge barré pour ce qui part, vert pour ce qui arrive. */
function Texte({ segments, cote }: { segments: Segment[]; cote: 'avant' | 'apres' }) {
  return (
    <>
      {segments.map((segment, index) =>
        segment.change ? (
          cote === 'avant' ? (
            <del key={index} className="bg-erreur/25 rounded-sm decoration-erreur/70">
              {segment.texte}
            </del>
          ) : (
            <ins key={index} className="bg-succes/25 rounded-sm no-underline">
              {segment.texte}
            </ins>
          )
        ) : (
          <span key={index}>{segment.texte}</span>
        ),
      )}
      {/* Une ligne vide garde sa hauteur. */}
      {segments.every((segment) => segment.texte === '') && ' '}
    </>
  );
}

const fondDeLigne = (ligne: DiffRow, cote: 'avant' | 'apres'): string => {
  if (ligne.genre === 'egal') {
    return '';
  }
  if (cote === 'avant') {
    return ligne.avant === null ? 'bg-texte/5' : 'bg-erreur/10';
  }
  return ligne.apres === null ? 'bg-texte/5' : 'bg-succes/10';
};

function Repli({ nombre, surDepli }: { nombre: number; surDepli: () => void }) {
  return (
    <button type="button" onClick={surDepli} className="text-discret hover:bg-texte/10 focus-visible:bg-texte/20 w-full rounded px-3 py-1 text-left text-xs outline-0">
      {nombre} lignes identiques, cliquer pour les montrer
    </button>
  );
}

function Colonnes({ lignes, surDepli }: { lignes: DisplayRow[]; surDepli: (debut: number) => void }) {
  return (
    <div className="grid grid-cols-2 gap-x-3">
      <p className="text-discret sticky top-0 bg-surface pb-1 text-xs font-medium">Avant</p>
      <p className="text-discret sticky top-0 bg-surface pb-1 text-xs font-medium">Proposition</p>
      {lignes.map((affichee, index) =>
        affichee.genre === 'replie' ? (
          <div key={index} className="col-span-2">
            <Repli nombre={affichee.nombre} surDepli={() => surDepli(affichee.debut)} />
          </div>
        ) : (
          <div key={index} className="contents">
            <div className={`rounded-sm px-2 whitespace-pre-wrap break-words ${fondDeLigne(affichee.ligne, 'avant')}`}>
              {affichee.ligne.avant !== null && <Texte segments={affichee.ligne.avant} cote="avant" />}
            </div>
            <div className={`rounded-sm px-2 whitespace-pre-wrap break-words ${fondDeLigne(affichee.ligne, 'apres')}`}>
              {affichee.ligne.apres !== null && <Texte segments={affichee.ligne.apres} cote="apres" />}
            </div>
          </div>
        ),
      )}
    </div>
  );
}

function Unifie({ lignes, surDepli }: { lignes: DisplayRow[]; surDepli: (debut: number) => void }) {
  return (
    <div>
      {lignes.map((affichee, index) => {
        if (affichee.genre === 'replie') {
          return <Repli key={index} nombre={affichee.nombre} surDepli={() => surDepli(affichee.debut)} />;
        }
        const { ligne } = affichee;
        if (ligne.genre === 'egal') {
          return (
            <div key={index} className="px-2 whitespace-pre-wrap break-words">
              <Texte segments={ligne.apres!} cote="apres" />
            </div>
          );
        }
        return (
          <div key={index}>
            {ligne.avant !== null && (
              <div className="bg-erreur/10 rounded-sm px-2 whitespace-pre-wrap break-words">
                <Texte segments={ligne.avant} cote="avant" />
              </div>
            )}
            {ligne.apres !== null && (
              <div className="bg-succes/10 rounded-sm px-2 whitespace-pre-wrap break-words">
                <Texte segments={ligne.apres} cote="apres" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface AiComparisonProps {
  avant: string;
  apres: string;
  mode: ComparisonMode;
}

/** Le texte Markdown de la page avant et après la proposition, en deux colonnes ou en une seule. */
export function AiComparison({ avant, apres, mode }: AiComparisonProps) {
  const lignes = useMemo(() => comparerTextes(avant, apres), [avant, apres]);
  // Débuts des suites identiques dépliées à la demande.
  const [depliees, definirDepliees] = useState<ReadonlySet<number>>(new Set());
  const affichees = useMemo(
    () =>
      replier(lignes).flatMap((affichee): DisplayRow[] =>
        affichee.genre === 'replie' && depliees.has(affichee.debut)
          ? lignes.slice(affichee.debut, affichee.debut + affichee.nombre).map((ligne) => ({ genre: 'ligne', ligne }))
          : [affichee],
      ),
    [lignes, depliees],
  );
  const surDepli = (debut: number): void => definirDepliees((actuelles) => new Set([...actuelles, debut]));
  const resume = resumer(lignes);
  const rien = resume.modifie + resume.retire + resume.ajoute === 0;
  return (
    <div className="space-y-2">
      <p className="text-discret text-xs" aria-live="polite">
        {rien
          ? 'La proposition ne change rien au texte.'
          : [
              resume.modifie > 0 ? `${resume.modifie} ligne${resume.modifie > 1 ? 's' : ''} modifiée${resume.modifie > 1 ? 's' : ''}` : '',
              resume.ajoute > 0 ? `${resume.ajoute} ajoutée${resume.ajoute > 1 ? 's' : ''}` : '',
              resume.retire > 0 ? `${resume.retire} retirée${resume.retire > 1 ? 's' : ''}` : '',
            ]
              .filter((partie) => partie !== '')
              .join(', ')}
      </p>
      <div className="font-mono text-[13px] leading-6" aria-label="Comparaison avant et après">
        {mode === 'colonnes' ? <Colonnes lignes={affichees} surDepli={surDepli} /> : <Unifie lignes={affichees} surDepli={surDepli} />}
      </div>
    </div>
  );
}
