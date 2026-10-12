import { nomDuLangage } from '@notes/ui';
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { Check, ChevronDown, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { LanguagePicker } from './LanguagePicker';

/**
 * Bloc de code dans l'éditeur (docs/spec/editeur.md) : une barre au-dessus du code avec
 * le langage, qu'on change dans une liste avec recherche, et un bouton pour
 * copier le code. La coloration et les numéros de ligne viennent de
 * `@notes/ui` (décorations), le reste du bloc est du texte ordinaire.
 */
export function CodeBlockView({ node, updateAttributes, editor }: NodeViewProps) {
  const langage = typeof node.attrs['language'] === 'string' && node.attrs['language'] !== '' ? (node.attrs['language'] as string) : null;
  const [choixOuvert, definirChoixOuvert] = useState(false);
  const [copie, definirCopie] = useState<'non' | 'fait' | 'echec'>('non');

  useEffect(() => {
    if (copie === 'non') {
      return;
    }
    const minuteur = window.setTimeout(() => definirCopie('non'), 1500);
    return () => window.clearTimeout(minuteur);
  }, [copie]);

  const copier = (): void => {
    void navigator.clipboard.writeText(node.textContent).then(
      () => definirCopie('fait'),
      () => definirCopie('echec'),
    );
  };

  const fermer = (): void => {
    definirChoixOuvert(false);
    editor.commands.focus();
  };

  return (
    <NodeViewWrapper className="bloc-de-code">
      <div contentEditable={false} className="barre-du-code">
        <div className="relative">
          <button
            type="button"
            disabled={!editor.isEditable}
            aria-haspopup="listbox"
            aria-expanded={choixOuvert}
            title="Langage du bloc"
            onMouseDown={(evenement) => evenement.preventDefault()}
            onClick={() => definirChoixOuvert((ouvert) => !ouvert)}
            className={`flex items-center gap-1 rounded px-1.5 py-0.5 ${choixOuvert ? 'bg-accent/25' : 'hover:bg-texte/10'} disabled:hover:bg-transparent`}
          >
            {langage === null ? 'Texte brut' : nomDuLangage(langage)}
            {editor.isEditable && <ChevronDown className="size-3" aria-hidden="true" />}
          </button>
          {choixOuvert && (
            <LanguagePicker
              actuel={langage}
              surChoix={(choisi) => {
                updateAttributes({ language: choisi });
                fermer();
              }}
              surFermeture={fermer}
            />
          )}
        </div>
        <button
          type="button"
          title="Copier le code"
          onMouseDown={(evenement) => evenement.preventDefault()}
          onClick={copier}
          className="hover:bg-texte/10 flex items-center gap-1 rounded px-1.5 py-0.5"
        >
          {copie === 'fait' ? <Check className="text-succes size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
          {copie === 'fait' ? 'Copié' : copie === 'echec' ? 'Copie impossible' : 'Copier'}
        </button>
        {/* Annonce à côté du bouton : un rôle « status » dans un bouton lui ferait perdre son nom dans Chromium. */}
        <span role="status" className="sr-only">
          {copie === 'fait' ? 'Code copié' : copie === 'echec' ? 'Copie impossible' : ''}
        </span>
      </div>
      <pre>
        <NodeViewContent<'code'> as="code" />
      </pre>
    </NodeViewWrapper>
  );
}
