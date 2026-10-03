import { PageView, classeDePage } from '@notes/ui';
import { GripVertical, RotateCcw, X } from 'lucide-react';
import { useRef, useState } from 'react';
import type { DragEvent, KeyboardEvent, ReactNode } from 'react';
import { estReglee } from './conflict-model';
import type { BlockChoice, ConflictLine, Cote, Jeton } from './conflict-model';

/** Couleur de chaque version : l'accent pour A (la page), l'alerte pour B (la version mise de côté). */
const fondDeVersion: Record<Cote, string> = { a: 'bg-accent/10', b: 'bg-alerte/10' };
const fondDeMorceau: Record<Cote, string> = { a: 'bg-accent/25', b: 'bg-alerte/25' };

export function Marque({ cote }: { cote: Cote }) {
  return (
    <span className={`inline-block rounded-sm px-1.5 align-[1px] text-[10px] leading-4 font-bold ${cote === 'a' ? 'bg-accent/30 text-texte' : 'bg-alerte/30 text-texte'}`}>
      {cote.toUpperCase()}
    </span>
  );
}

const bouton = (actif: boolean): string =>
  `flex h-7 min-w-7 items-center justify-center gap-1.5 rounded px-2 text-sm outline-0 focus-visible:bg-accent/40 ${actif ? 'bg-accent/25' : 'hover:bg-texte/10'}`;

function Outils({ reglee, children }: { reglee: boolean; children: ReactNode }) {
  return (
    <div role="toolbar" className="border-bordure bg-surface mt-1 mb-2 inline-flex flex-wrap items-center gap-0.5 rounded-md border p-1 text-sm">
      <span className="text-discret flex items-center gap-1.5 px-1.5 text-xs">
        <span className={`size-1.5 rounded-full ${reglee ? 'bg-succes' : 'bg-alerte'}`} aria-hidden="true" />
        {reglee ? 'Réglé' : 'À régler'}
      </span>
      <span className="bg-bordure mx-1 h-5 w-px" aria-hidden="true" />
      {children}
    </div>
  );
}

export interface BlockLineProps {
  ligne: Extract<ConflictLine, { genre: 'bloc' }>;
  resoudreImage: (src: string) => string | null;
  surChoix: (choix: BlockChoice) => void;
  /** Début d'un glisser de la poignée d'une version. */
  surPrise: (cote: Cote) => void;
  surFin: () => void;
  /** Ctrl+Maj+flèche sur la poignée : une ligne plus haut (-1) ou plus bas (+1). */
  surPas: (cote: Cote, sens: -1 | 1) => void;
}

/** Bloc d'un seul côté ou entièrement différent : les versions l'une sous l'autre, chacune avec sa poignée. */
export function BlockLine({ ligne, resoudreImage, surChoix, surPrise, surFin, surPas }: BlockLineProps) {
  const cotes = (['a', 'b'] as const).filter((cote) => ligne[cote] !== null);
  const seul: Cote | null = cotes.length === 1 ? (cotes[0] ?? null) : null;
  return (
    <div className={`-mx-2.5 mb-3 rounded-md px-2.5 pt-1.5 pb-0.5 ${estReglee(ligne) || ligne.deplace ? '' : 'bg-texte/[0.04]'}`}>
      {cotes.map((cote) => {
        const garde = ligne.choix === null || ligne.choix === cote || ligne.choix === 'ab';
        return (
          <div key={cote} className={`relative -mx-1.5 mb-1 rounded py-0.5 pr-8 pl-7 ${garde ? fondDeVersion[cote] : 'line-through opacity-30'}`}>
            {garde && (
              <button
                type="button"
                draggable
                aria-label={`Déplacer la version ${cote.toUpperCase()} ailleurs dans la page (glisser, ou Ctrl+Maj+flèches)`}
                title="Glisser pour placer ce bloc ailleurs dans la page"
                onDragStart={(evenement) => {
                  evenement.dataTransfer.effectAllowed = 'move';
                  const version = evenement.currentTarget.parentElement;
                  if (version !== null) {
                    evenement.dataTransfer.setDragImage(version, 0, 0);
                  }
                  surPrise(cote);
                }}
                onDragEnd={surFin}
                onKeyDown={(evenement) => {
                  if (evenement.ctrlKey && evenement.shiftKey && (evenement.key === 'ArrowUp' || evenement.key === 'ArrowDown')) {
                    evenement.preventDefault();
                    surPas(cote, evenement.key === 'ArrowUp' ? -1 : 1);
                  }
                }}
                data-poignee={cote}
                className="text-discret hover:bg-texte/10 hover:text-texte focus-visible:bg-accent/40 focus-visible:text-texte absolute top-1 left-1 flex h-6 w-5 cursor-grab items-center justify-center rounded outline-0"
              >
                <GripVertical className="size-3.5" aria-hidden="true" />
              </button>
            )}
            <span className="absolute top-1.5 right-1.5 z-10">
              <Marque cote={cote} />
            </span>
            <PageView corps={ligne[cote] as string} resoudreImage={resoudreImage} />
          </div>
        );
      })}
      <Outils reglee={estReglee(ligne)}>
        {seul === null ? (
          <>
            <button type="button" aria-pressed={ligne.choix === 'a'} onClick={() => surChoix('a')} className={bouton(ligne.choix === 'a')}>
              Garder <Marque cote="a" />
            </button>
            <button type="button" aria-pressed={ligne.choix === 'b'} onClick={() => surChoix('b')} className={bouton(ligne.choix === 'b')}>
              Garder <Marque cote="b" />
            </button>
            <button type="button" aria-pressed={ligne.choix === 'ab'} onClick={() => surChoix('ab')} title="B placé après A" className={bouton(ligne.choix === 'ab')}>
              Les deux
            </button>
            <span className="text-discret px-1.5 text-xs">B après A, ou ailleurs par sa poignée</span>
          </>
        ) : (
          <>
            <button type="button" aria-pressed={ligne.choix === seul} onClick={() => surChoix(seul)} className={bouton(ligne.choix === seul)}>
              Garder
            </button>
            <button type="button" aria-pressed={ligne.choix === 'aucun'} onClick={() => surChoix('aucun')} className={bouton(ligne.choix === 'aucun')}>
              Retirer
            </button>
            <span className="text-discret flex items-center gap-1 px-1.5 text-xs">
              {ligne.deplace ? 'déplacé, vient de' : 'seulement dans'} <Marque cote={seul} />
            </span>
          </>
        )}
      </Outils>
    </div>
  );
}

export interface TextLineProps {
  ligne: Extract<ConflictLine, { genre: 'texte' }>;
  surGarde: (garde: Cote | 'affiche') => void;
  surRecommencer: () => void;
  surRetrait: (indice: number) => void;
  /** Le jeton `de` va avant celui de position `avant`. */
  surDeplacement: (de: number, avant: number) => void;
}

/**
 * Paragraphe ou titre dont un passage diffère : les deux passages dans le
 * texte, B après A, chacun avec sa poignée pour le placer entre deux autres
 * mots et son × pour le retirer. Le texte est montré tel qu'il est écrit.
 */
export function TextLine({ ligne, surGarde, surRecommencer, surRetrait, surDeplacement }: TextLineProps) {
  const [glisse, definirGlisse] = useState<number | null>(null);
  const [depot, definirDepot] = useState<number | null>(null);
  const paragraphe = useRef<HTMLHeadingElement>(null);
  const premier = ligne.jetons[0];
  const niveau = premier !== undefined && 'mot' in premier && /^#{1,5}$/.test(premier.mot) ? premier.mot.length : null;
  const Balise = niveau === null ? 'p' : (`h${niveau}` as 'h1');

  const surSurvol = (evenement: DragEvent<HTMLElement>): void => {
    if (glisse === null) {
      return;
    }
    evenement.preventDefault();
    const cible = (evenement.target as HTMLElement).closest<HTMLElement>('[data-jeton]');
    if (cible !== null) {
      const boite = cible.getBoundingClientRect();
      definirDepot(Number(cible.dataset['jeton']) + (evenement.clientX > boite.left + boite.width / 2 ? 1 : 0));
    }
  };

  const auClavier = (indice: number) => (evenement: KeyboardEvent<HTMLElement>) => {
    if (evenement.key === 'ArrowLeft' || evenement.key === 'ArrowRight') {
      evenement.preventDefault();
      const vers = evenement.key === 'ArrowLeft' ? indice - 1 : indice + 2;
      if (vers >= 0 && vers <= ligne.jetons.length) {
        surDeplacement(indice, vers);
        const position = evenement.key === 'ArrowLeft' ? indice - 1 : indice + 1;
        requestAnimationFrame(() => paragraphe.current?.querySelector<HTMLElement>(`[data-jeton="${position}"]`)?.focus());
      }
    } else if (evenement.key === 'Delete' || evenement.key === 'Backspace') {
      evenement.preventDefault();
      surRetrait(indice);
    }
  };

  const repere = <span className="bg-accent inline-block h-[1.1em] w-0.5 align-[-0.15em]" aria-hidden="true" />;
  return (
    <div className={`-mx-2.5 mb-3 rounded-md px-2.5 pt-1.5 pb-0.5 ${ligne.reglee ? '' : 'bg-texte/[0.04]'}`}>
      <div className={classeDePage}>
        <Balise
          ref={paragraphe}
          onDragOver={surSurvol}
          onDrop={(evenement) => {
            evenement.preventDefault();
            if (glisse !== null && depot !== null) {
              surDeplacement(glisse, depot);
            }
            definirGlisse(null);
            definirDepot(null);
          }}
        >
          {ligne.jetons.map((jeton: Jeton, indice) => {
            if (indice === 0 && niveau !== null) {
              return null;
            }
            const espace = indice > (niveau === null ? 0 : 1) ? ' ' : '';
            if ('mot' in jeton) {
              return (
                <span key={indice}>
                  {depot === indice && repere}
                  {espace}
                  <span data-jeton={indice}>{jeton.mot}</span>
                </span>
              );
            }
            return (
              <span key={indice}>
                {depot === indice && repere}
                {espace}
                <span
                  data-jeton={indice}
                  tabIndex={0}
                  draggable
                  aria-label={`Version ${jeton.cote.toUpperCase()} : ${jeton.texte}. Flèches pour la déplacer, Suppr pour la retirer.`}
                  onDragStart={(evenement) => {
                    evenement.dataTransfer.effectAllowed = 'move';
                    definirGlisse(indice);
                  }}
                  onDragEnd={() => {
                    definirGlisse(null);
                    definirDepot(null);
                  }}
                  onKeyDown={auClavier(indice)}
                  className={`focus-visible:bg-accent/45 rounded py-px pr-0.5 outline-0 ${fondDeMorceau[jeton.cote]} ${glisse === indice ? 'opacity-35' : ''}`}
                >
                  <GripVertical className="text-discret inline size-3.5 cursor-grab align-[-0.15em]" aria-hidden="true" />
                  <sup className="text-discret mr-0.5 text-[0.55em] font-bold">{jeton.cote.toUpperCase()}</sup>
                  {jeton.texte}
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => surRetrait(indice)}
                    aria-label={`Retirer la version ${jeton.cote.toUpperCase()}`}
                    title="Retirer cette version"
                    className="text-discret hover:bg-texte/15 hover:text-texte ml-0.5 inline-flex rounded px-0.5 align-[-0.1em]"
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                </span>
              </span>
            );
          })}
          {depot === ligne.jetons.length && repere}
        </Balise>
      </div>
      <Outils reglee={ligne.reglee}>
        <button type="button" onClick={() => surGarde('a')} className={bouton(false)}>
          Garder <Marque cote="a" />
        </button>
        <button type="button" onClick={() => surGarde('b')} className={bouton(false)}>
          Garder <Marque cote="b" />
        </button>
        <button type="button" onClick={() => surGarde('affiche')} title="Les deux passages, à la place où ils sont" className={bouton(false)}>
          Les deux
        </button>
        <span className="bg-bordure mx-1 h-5 w-px" aria-hidden="true" />
        <button type="button" onClick={surRecommencer} aria-label="Recommencer" title="Recommencer" className={bouton(false)}>
          <RotateCcw className="size-3.5" aria-hidden="true" />
        </button>
      </Outils>
    </div>
  );
}
