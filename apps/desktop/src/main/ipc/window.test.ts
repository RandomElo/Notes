import type { BrowserWindow } from 'electron';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { creerHandlersFenetre } from './window';

function monter(attendreEcritures?: () => Promise<void>) {
  const fenetre = { close: vi.fn() };
  const handlers = creerHandlersFenetre(() => fenetre as unknown as BrowserWindow, attendreEcritures);
  const evenement = { preventDefault: vi.fn() };
  const prevenir = vi.fn();
  return { fenetre, handlers, evenement, prevenir };
}

describe('fermeture de la fenêtre', () => {
  afterEach(() => vi.useRealTimers());

  it('retient la fermeture et prévient le renderer une seule fois', () => {
    vi.useFakeTimers();
    const { handlers, evenement, prevenir, fenetre } = monter();
    handlers.surDemandeDeFermeture(evenement, prevenir);
    handlers.surDemandeDeFermeture(evenement, prevenir);
    expect(evenement.preventDefault).toHaveBeenCalledTimes(2);
    expect(prevenir).toHaveBeenCalledTimes(1);
    expect(fenetre.close).not.toHaveBeenCalled();
  });

  it('ferme après la confirmation, une fois les écritures terminées', async () => {
    vi.useFakeTimers();
    let finir = (): void => undefined;
    const ecritures = new Promise<void>((resoudre) => (finir = resoudre));
    const { handlers, evenement, prevenir, fenetre } = monter(() => ecritures);
    handlers.surDemandeDeFermeture(evenement, prevenir);

    const confirmation = handlers.confirmerFermeture();
    await Promise.resolve();
    expect(fenetre.close).not.toHaveBeenCalled();
    finir();
    await confirmation;
    expect(fenetre.close).toHaveBeenCalledTimes(1);

    // La fermeture confirmée n'est plus retenue.
    const suivant = { preventDefault: vi.fn() };
    handlers.surDemandeDeFermeture(suivant, prevenir);
    expect(suivant.preventDefault).not.toHaveBeenCalled();
  });

  it('ferme quand même si le renderer ne répond pas', async () => {
    vi.useFakeTimers();
    const { handlers, evenement, prevenir, fenetre } = monter();
    handlers.surDemandeDeFermeture(evenement, prevenir);
    await vi.advanceTimersByTimeAsync(2999);
    expect(fenetre.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(fenetre.close).toHaveBeenCalledTimes(1);
  });
});
