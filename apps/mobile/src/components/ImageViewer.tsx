import { X } from 'lucide-react';
import { useRef, useState } from 'react';
import type { TouchEvent } from 'react';
import { useFermetureParRetour } from '../state/navigation';
import { BoutonIcone } from './TopBar';

interface Vue {
  echelle: number;
  x: number;
  y: number;
}

const neutre: Vue = { echelle: 1, x: 0, y: 0 };

/** Visionneuse plein écran (docs/spec/android.md) : pincer pour zoomer, glisser pour se déplacer, toucher deux fois pour zoomer ou revenir. */
export function ImageViewer({ adresse, legende, fermer }: { adresse: string; legende: string; fermer: () => void }) {
  const [vue, definirVue] = useState<Vue>(neutre);
  const geste = useRef<{ distance: number; echelle: number; x: number; y: number; vue: Vue } | null>(null);
  const dernierToucher = useRef(0);
  useFermetureParRetour(true, fermer);

  const debut = (evenement: TouchEvent): void => {
    const [a, b] = [evenement.touches[0], evenement.touches[1]];
    if (a === undefined) {
      return;
    }
    if (b !== undefined) {
      geste.current = { distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), echelle: vue.echelle, x: 0, y: 0, vue };
      return;
    }
    const maintenant = Date.now();
    if (maintenant - dernierToucher.current < 300) {
      definirVue(vue.echelle > 1 ? neutre : { echelle: 2.5, x: 0, y: 0 });
      dernierToucher.current = 0;
      geste.current = null;
      return;
    }
    dernierToucher.current = maintenant;
    geste.current = { distance: 0, echelle: vue.echelle, x: a.clientX, y: a.clientY, vue };
  };

  const mouvement = (evenement: TouchEvent): void => {
    const depart = geste.current;
    const [a, b] = [evenement.touches[0], evenement.touches[1]];
    if (depart === null || a === undefined) {
      return;
    }
    if (b !== undefined && depart.distance > 0) {
      const echelle = Math.min(5, Math.max(1, (depart.echelle * Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)) / depart.distance));
      definirVue({ ...depart.vue, echelle });
    } else if (b === undefined && depart.vue.echelle > 1) {
      definirVue({ ...depart.vue, x: depart.vue.x + a.clientX - depart.x, y: depart.vue.y + a.clientY - depart.y });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black" role="dialog" aria-label="Image">
      <div className="marge-haut absolute inset-x-0 top-0 z-10 flex justify-end p-1 text-white">
        <BoutonIcone libelle="Fermer" onClick={fermer}>
          <X className="size-6 text-white" />
        </BoutonIcone>
      </div>
      <div
        className="flex min-h-0 flex-1 touch-none items-center justify-center overflow-hidden"
        onTouchStart={debut}
        onTouchMove={mouvement}
        onTouchEnd={() => (geste.current = null)}
        onDoubleClick={() => definirVue(vue.echelle > 1 ? neutre : { echelle: 2.5, x: 0, y: 0 })}
      >
        <img
          src={adresse}
          alt={legende}
          draggable={false}
          className="max-h-full max-w-full object-contain"
          style={{ transform: `translate(${vue.x}px, ${vue.y}px) scale(${vue.echelle})` }}
        />
      </div>
      {legende !== '' && <p className="marge-bas px-4 py-3 text-center text-sm text-white/80">{legende}</p>}
    </div>
  );
}
