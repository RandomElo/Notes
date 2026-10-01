import type { NotesApi } from '../../../shared/ipc-contract';

declare global {
  interface Window {
    /** API exposée par le preload. Seul point de contact avec le main. */
    readonly notes: NotesApi;
  }
}

export const api: NotesApi = window.notes;
