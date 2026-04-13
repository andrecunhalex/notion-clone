// ---------------------------------------------------------------------------
// Module-level design library store
// ---------------------------------------------------------------------------
// A lightweight singleton that holds the *currently active* library snapshot
// plus a subscribe/notify mechanism. Exists so that low-level helpers like
// `getTemplate(id)` can be called from anywhere (DesignBlock render, SlashMenu
// preview) without prop-drilling the whole library, and so that components can
// subscribe via `useSyncExternalStore` for fine-grained re-renders.
//
// The library provider swaps the active implementation on mount/unmount.
// Only components that actually subscribe will re-render — editor-level state
// stays untouched, so this is safe to mutate on realtime updates.
// ---------------------------------------------------------------------------

import type { DesignLibraryInterface, LibrarySnapshot, LibraryTemplate, LibraryClause } from './types';

const EMPTY_SNAPSHOT: LibrarySnapshot = { templates: [], clauses: [] };

let activeLibrary: DesignLibraryInterface | null = null;
let cachedSnapshot: LibrarySnapshot = EMPTY_SNAPSHOT;
const listeners = new Set<() => void>();
let unsubscribeFromActive: (() => void) | null = null;

function notify() {
  for (const l of listeners) l();
}

/** Called by the provider. Pass null on unmount to detach. */
export function setActiveLibrary(lib: DesignLibraryInterface | null) {
  if (unsubscribeFromActive) {
    unsubscribeFromActive();
    unsubscribeFromActive = null;
  }
  activeLibrary = lib;
  cachedSnapshot = lib ? lib.getSnapshot() : EMPTY_SNAPSHOT;
  if (lib) {
    unsubscribeFromActive = lib.subscribe(() => {
      cachedSnapshot = lib.getSnapshot();
      notify();
    });
  }
  notify();
}

export function getActiveLibrary(): DesignLibraryInterface | null {
  return activeLibrary;
}

// ---------------------------------------------------------------------------
// useSyncExternalStore-compatible API
// ---------------------------------------------------------------------------

export function subscribeLibrary(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getLibrarySnapshot(): LibrarySnapshot {
  return cachedSnapshot;
}

// ---------------------------------------------------------------------------
// Lookup helpers (sync, used by rendering code)
// ---------------------------------------------------------------------------

export function getTemplateFromStore(id: string): LibraryTemplate | undefined {
  return cachedSnapshot.templates.find(t => t.id === id);
}

export function getClauseFromStore(id: string): LibraryClause | undefined {
  return cachedSnapshot.clauses.find(c => c.id === id);
}
