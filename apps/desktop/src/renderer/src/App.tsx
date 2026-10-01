import { NotebookText } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NasConnectionPanel } from './features/settings/NasConnectionPanel';
import { api } from './lib/ipc';

/** Socle J0 : l'application n'a encore qu'un écran, la connexion au NAS. */
export function App() {
  const [version, definirVersion] = useState('');

  useEffect(() => {
    void api.version().then(definirVersion);
  }, []);

  return (
    <div className="flex h-full flex-col">
      <header className="border-bordure flex items-center gap-3 border-b px-6 py-4">
        <NotebookText className="text-accent size-5" aria-hidden="true" />
        <h1 className="text-base font-semibold">Notes</h1>
        {version !== '' && <span className="text-discret text-sm">version {version}</span>}
      </header>
      <main className="flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-2xl">
          <NasConnectionPanel />
        </div>
      </main>
    </div>
  );
}
