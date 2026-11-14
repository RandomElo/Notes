import { RotateCcw } from 'lucide-react';
import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { signalerErreurReact } from './report-errors';

interface PageErrorBoundaryProps {
  /** Rouvre la page : son éditeur repart du fichier enregistré. */
  surReouverture: () => void;
  children: ReactNode;
}

/**
 * Une erreur dans l'affichage de la page ne vide plus toute la fenêtre (l'écran gris) : la page
 * seule est remplacée par un message et « Rouvrir la page », l'arborescence et les onglets
 * restent. L'erreur part au journal des erreurs, comme les autres.
 */
export class PageErrorBoundary extends Component<PageErrorBoundaryProps, { enErreur: boolean }> {
  override state = { enErreur: false };

  static getDerivedStateFromError(): { enErreur: boolean } {
    return { enErreur: true };
  }

  override componentDidCatch(erreur: unknown, info: ErrorInfo): void {
    signalerErreurReact(erreur, { componentStack: info.componentStack ?? undefined });
  }

  override render(): ReactNode {
    if (!this.state.enErreur) {
      return this.props.children;
    }
    return (
      <div role="alert" className="mx-auto max-w-xl space-y-3 py-16 text-sm">
        <p className="text-base font-medium">L'affichage de la page a rencontré une erreur.</p>
        <p className="text-discret">Ce qui était enregistré est intact. L'erreur est notée dans le journal des erreurs.</p>
        <button
          type="button"
          onClick={() => {
            this.setState({ enErreur: false });
            this.props.surReouverture();
          }}
          className="bg-accent/20 hover:bg-accent/35 focus-visible:bg-accent/45 inline-flex h-8 items-center gap-2 rounded-md px-3 font-medium outline-0"
        >
          <RotateCcw className="size-4" aria-hidden="true" />
          Rouvrir la page
        </button>
      </div>
    );
  }
}
